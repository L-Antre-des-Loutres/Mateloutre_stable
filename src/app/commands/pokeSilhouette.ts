import {
    AttachmentBuilder,
    ChatInputCommandInteraction,
    ColorResolvable,
    EmbedBuilder,
    Message,
    MessageCollector,
    MessageCollectorOptions,
    MessageCreateOptions,
    MessageFlags,
    MessagePayload,
    SlashCommandBuilder,
} from "discord.js";
import { SlashCommand } from "../../otterbots/types";
import { otterlogs } from "../../otterbots/utils/otterlogs";
import { PapiService } from "../utils/papi/papiService";
import { PokemonData } from "../utils/pokedle/gameLogic";
import { POKE_SILHOUETTE_CONSTANTS } from "../utils/pokeSilhouette/constants";
import { buildNameIndex, normalizeName } from "../utils/pokeSilhouette/answerMatching";
import { PokemonImages, renderPokemonImages } from "../utils/pokeSilhouette/silhouetteImage";
import { PokeSilhouetteStatsService } from "../utils/pokeSilhouette/silhouetteStats";

// Declared structurally: TextBasedChannel also covers PartialGroupDMChannel, which has
// no collector. The `in` guards in execute narrow those away before the cast.
type GameChannel = {
    id: string;
    send(options: string | MessagePayload | MessageCreateOptions): Promise<Message>;
    createMessageCollector(options?: MessageCollectorOptions): MessageCollector;
};

// Running games, kept in memory on purpose: a collector does not survive a restart,
// so a persisted lock would leave ghost games behind after a reboot.
const publicGames = new Set<string>();
const soloGames = new Set<string>();

function soloKey(channelId: string, userId: string): string {
    return `${channelId}:${userId}`;
}

function hasSoloGameInChannel(channelId: string): boolean {
    const prefix = `${channelId}:`;
    for (const key of soloGames) {
        if (key.startsWith(prefix)) return true;
    }
    return false;
}

interface SilhouetteWinner {
    userId: string;
    elapsedMs: number;
}

interface RoundContext {
    interaction: ChatInputCommandInteraction;
    channel: GameChannel;
    isPublic: boolean;
    isInfinite: boolean;
    hostId: string;
    color: ColorResolvable;
    pokemonList: PokemonData[];
    nameIndex: Map<string, PokemonData>;
    /** 1-based. The first round answers the interaction, the next ones post new messages. */
    round: number;
}

interface RoundOutcome {
    /** True as soon as someone posted a real Pokémon name, right or wrong. */
    attempted: boolean;
    winners: SilhouetteWinner[];
}

/**
 * Formats an elapsed duration in seconds with millisecond precision, French style.
 */
function formatElapsed(elapsedMs: number): string {
    return (Math.max(elapsedMs, 0) / 1000).toFixed(3).replace(".", ",");
}

/**
 * Builds the result line-up when several players answered within the tie window.
 */
function buildTieDescription(winners: SilhouetteWinner[], pokemonName: string): string {
    const listed = winners.slice(0, POKE_SILHOUETTE_CONSTANTS.TIE_MAX_LISTED);

    const lines = listed.map((winner, index) => POKE_SILHOUETTE_CONSTANTS.MSG_TIE_LINE
        .replace("{medal}", POKE_SILHOUETTE_CONSTANTS.TIE_MEDALS[index] ?? POKE_SILHOUETTE_CONSTANTS.TIE_MEDAL_DEFAULT)
        .replace("{user}", `<@${winner.userId}>`)
        .replace("{seconds}", formatElapsed(winner.elapsedMs)));

    const remaining = winners.length - listed.length;
    if (remaining > 0) {
        lines.push(POKE_SILHOUETTE_CONSTANTS.MSG_TIE_MORE.replace("{count}", remaining.toString()));
    }

    return POKE_SILHOUETTE_CONSTANTS.MSG_TIE
        .replace("{count}", winners.length.toString())
        .replace("{pokemon}", pokemonName)
        .replace("{window}", POKE_SILHOUETTE_CONSTANTS.TIE_WINDOW_MS.toString())
        .replace("{list}", lines.join("\n"));
}

/**
 * Picks a random Pokémon whose artwork can actually be turned into a silhouette.
 * Retries a few times so one broken sprite does not cancel the game.
 */
async function drawPlayablePokemon(
    pokemonList: PokemonData[]
): Promise<{ pokemon: PokemonData; images: PokemonImages } | null> {
    const tried = new Set<number>();

    for (let attempt = 0; attempt < POKE_SILHOUETTE_CONSTANTS.MAX_DRAW_ATTEMPTS; attempt++) {
        const candidates = pokemonList.filter(p => !tried.has(p.id));
        if (candidates.length === 0) return null;

        const pokemon = candidates[Math.floor(Math.random() * candidates.length)];
        tried.add(pokemon.id);

        const images = await renderPokemonImages(pokemon);
        if (images) return { pokemon, images };
    }

    return null;
}

/**
 * Joue une manche complète : tirage, silhouette, écoute des réponses, révélation.
 * Résout quand la manche est terminée. Renvoie null si elle n'a pas pu démarrer.
 */
async function runRound(context: RoundContext): Promise<RoundOutcome | null> {
    const { interaction, channel, isPublic, isInfinite, hostId, color, pokemonList, nameIndex, round } = context;
    const isFirstRound = round === 1;

    const draw = await drawPlayablePokemon(pokemonList);
    if (!draw) {
        const content = POKE_SILHOUETTE_CONSTANTS.MSG_IMAGE_ERROR;
        if (isFirstRound) await interaction.editReply({ content });
        else await channel.send({ content }).catch(() => undefined);
        return null;
    }

    const { pokemon, images } = draw;
    const seconds = POKE_SILHOUETTE_CONSTANTS.GAME_DURATION_MS / 1000;

    const footer = isInfinite
        ? POKE_SILHOUETTE_CONSTANTS.FOOTER_TEXT_INFINITE
            .replace("{round}", round.toString())
            .replace("{seconds}", seconds.toString())
        : POKE_SILHOUETTE_CONSTANTS.FOOTER_TEXT.replace("{seconds}", seconds.toString());

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(POKE_SILHOUETTE_CONSTANTS.EMBED_TITLE)
        .setDescription(isPublic
            ? POKE_SILHOUETTE_CONSTANTS.MSG_PROMPT_PUBLIC
            : POKE_SILHOUETTE_CONSTANTS.MSG_PROMPT_SOLO.replace("{user}", `<@${hostId}>`))
        .setImage(`attachment://${POKE_SILHOUETTE_CONSTANTS.SILHOUETTE_IMAGE_NAME}`)
        .setFooter({ text: footer });

    const payload = {
        embeds: [embed],
        files: [new AttachmentBuilder(images.silhouette, { name: POKE_SILHOUETTE_CONSTANTS.SILHOUETTE_IMAGE_NAME })],
    };

    // Later rounds post their own message: reusing the interaction reply would overwrite
    // the previous reveal and erase the series history.
    let roundMessage: Message | null = null;
    if (isFirstRound) {
        await interaction.editReply(payload);
    } else {
        roundMessage = await channel.send(payload);
    }

    const targetKey = normalizeName(pokemon.name);
    const startedAt = Date.now();
    const winners: SilhouetteWinner[] = [];
    let attempted = false;
    let tieTimer: NodeJS.Timeout | null = null;

    const collector = channel.createMessageCollector({
        filter: (message: Message) => !message.author.bot && (isPublic || message.author.id === hostId),
        time: POKE_SILHOUETTE_CONSTANTS.GAME_DURATION_MS,
    });

    collector.on("collect", async (message: Message) => {
        const guess = normalizeName(message.content.trim());
        if (!guess) return;

        if (guess === targetKey) {
            // Everything below runs before the first await, so two answers landing in
            // the same tick cannot overwrite each other.
            attempted = true;
            const elapsedMs = Date.now() - startedAt;
            if (!winners.some(winner => winner.userId === message.author.id)) {
                winners.push({ userId: message.author.id, elapsedMs });
            }

            // The game stays open a moment longer: answers this close are a tie, not a loss.
            if (!tieTimer) {
                tieTimer = setTimeout(() => collector.stop("found"), POKE_SILHOUETTE_CONSTANTS.TIE_WINDOW_MS);
            }

            await message.react(POKE_SILHOUETTE_CONSTANTS.EMOJI_CORRECT).catch(() => undefined);
            return;
        }

        // Stay silent on ordinary chat, only real Pokémon names get a ❌.
        if (nameIndex.has(guess)) {
            attempted = true;
            await message.react(POKE_SILHOUETTE_CONSTANTS.EMOJI_WRONG).catch(() => undefined);
        }
    });

    await new Promise<void>(resolve => {
        collector.on("end", () => {
            // The game can also end on timeout while the tie window is still pending.
            if (tieTimer) {
                clearTimeout(tieTimer);
                tieTimer = null;
            }
            resolve();
        });
    });

    winners.sort((a, b) => a.elapsedMs - b.elapsedMs);

    try {
        const revealEmbed = new EmbedBuilder()
            .setColor(color)
            .setImage(`attachment://${POKE_SILHOUETTE_CONSTANTS.REVEAL_IMAGE_NAME}`);

        if (winners.length > 0) {
            revealEmbed
                .setTitle(POKE_SILHOUETTE_CONSTANTS.EMBED_WIN_TITLE.replace("{pokemon}", pokemon.name))
                .setDescription(winners.length === 1
                    ? POKE_SILHOUETTE_CONSTANTS.MSG_WIN
                        .replace("{user}", `<@${winners[0].userId}>`)
                        .replace("{pokemon}", pokemon.name)
                        .replace("{seconds}", formatElapsed(winners[0].elapsedMs))
                    : buildTieDescription(winners, pokemon.name));
        } else {
            revealEmbed
                .setTitle(POKE_SILHOUETTE_CONSTANTS.EMBED_TIMEOUT_TITLE)
                .setDescription((isPublic
                    ? POKE_SILHOUETTE_CONSTANTS.MSG_TIMEOUT_PUBLIC
                    : POKE_SILHOUETTE_CONSTANTS.MSG_TIMEOUT_SOLO).replace("{pokemon}", pokemon.name));
        }

        // attachments: [] drops the silhouette, otherwise both images would stay attached.
        const revealPayload = {
            embeds: [revealEmbed],
            files: [new AttachmentBuilder(images.reveal, { name: POKE_SILHOUETTE_CONSTANTS.REVEAL_IMAGE_NAME })],
            attachments: [],
        };

        if (roundMessage) await roundMessage.edit(revealPayload);
        else await interaction.editReply(revealPayload);
    } catch (error) {
        otterlogs.error(`Impossible de révéler le Pokémon de poke-silhouette: ${error}`);
    }

    // Recorded last, and on its own: PocketBase being down must never cost the
    // players their reveal. The service swallows its own errors.
    await PokeSilhouetteStatsService.recordGame({
        pokemonId: pokemon.id,
        pokemonName: pokemon.name,
        isPublic,
        hostDiscordId: hostId,
        channelId: channel.id,
        startedAt: new Date(startedAt),
        durationMs: POKE_SILHOUETTE_CONSTANTS.GAME_DURATION_MS,
        winners: winners.map(winner => ({ discordUserId: winner.userId, elapsedMs: winner.elapsedMs })),
    });

    return { attempted, winners };
}

export default {
    name: POKE_SILHOUETTE_CONSTANTS.COMMAND_NAME,
    autocomplete: false,
    data: new SlashCommandBuilder()
        .setName(POKE_SILHOUETTE_CONSTANTS.COMMAND_NAME)
        .setDescription(POKE_SILHOUETTE_CONSTANTS.COMMAND_DESCRIPTION)
        .addStringOption(opt =>
            opt.setName(POKE_SILHOUETTE_CONSTANTS.OPTION_PUBLIC_NAME)
                .setDescription(POKE_SILHOUETTE_CONSTANTS.OPTION_PUBLIC_DESCRIPTION)
                .setRequired(false)
                .addChoices(
                    { name: POKE_SILHOUETTE_CONSTANTS.OPTION_PUBLIC_YES_LABEL, value: POKE_SILHOUETTE_CONSTANTS.OPTION_PUBLIC_YES },
                    { name: POKE_SILHOUETTE_CONSTANTS.OPTION_PUBLIC_NO_LABEL, value: POKE_SILHOUETTE_CONSTANTS.OPTION_PUBLIC_NO },
                )
        )
        .addStringOption(opt =>
            opt.setName(POKE_SILHOUETTE_CONSTANTS.OPTION_INFINITE_NAME)
                .setDescription(POKE_SILHOUETTE_CONSTANTS.OPTION_INFINITE_DESCRIPTION)
                .setRequired(false)
                .addChoices(
                    { name: POKE_SILHOUETTE_CONSTANTS.OPTION_INFINITE_YES_LABEL, value: POKE_SILHOUETTE_CONSTANTS.OPTION_INFINITE_YES },
                    { name: POKE_SILHOUETTE_CONSTANTS.OPTION_INFINITE_NO_LABEL, value: POKE_SILHOUETTE_CONSTANTS.OPTION_INFINITE_NO },
                )
        ) as SlashCommandBuilder,

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const channel = interaction.channel;
        if (!channel || !channel.isTextBased() || !("createMessageCollector" in channel) || !("send" in channel)) {
            await interaction.reply({
                content: POKE_SILHOUETTE_CONSTANTS.MSG_INVALID_CHANNEL,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const publicOption = interaction.options.getString(POKE_SILHOUETTE_CONSTANTS.OPTION_PUBLIC_NAME);
        const isPublic = (publicOption ?? POKE_SILHOUETTE_CONSTANTS.OPTION_PUBLIC_YES) === POKE_SILHOUETTE_CONSTANTS.OPTION_PUBLIC_YES;

        const infiniteOption = interaction.options.getString(POKE_SILHOUETTE_CONSTANTS.OPTION_INFINITE_NAME);
        const isInfinite = (infiniteOption ?? POKE_SILHOUETTE_CONSTANTS.OPTION_INFINITE_NO) === POKE_SILHOUETTE_CONSTANTS.OPTION_INFINITE_YES;

        const channelId = channel.id;
        const userId = interaction.user.id;
        const key = soloKey(channelId, userId);

        // A message must never be seen by two collectors, otherwise it would get a ✅ from
        // one game and a ❌ from the other. Solo games of different players can coexist.
        if (publicGames.has(channelId) || (isPublic && hasSoloGameInChannel(channelId))) {
            await interaction.reply({
                content: POKE_SILHOUETTE_CONSTANTS.MSG_GAME_IN_PROGRESS_CHANNEL,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        if (!isPublic && soloGames.has(key)) {
            await interaction.reply({
                content: POKE_SILHOUETTE_CONSTANTS.MSG_GAME_IN_PROGRESS_SOLO,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        // Reserved before the first await, so two quick commands cannot both pass the checks.
        if (isPublic) publicGames.add(channelId);
        else soloGames.add(key);

        try {
            await interaction.deferReply();

            const pokemonList = await PapiService.getAllPokemonForPokedle();
            if (pokemonList.length === 0) {
                await interaction.editReply({ content: POKE_SILHOUETTE_CONSTANTS.MSG_NO_DATA });
                return;
            }

            const nameIndex = buildNameIndex(pokemonList);
            const color = (process.env.BOT_COLOR || "#f89800") as ColorResolvable;

            let round = 1;
            for (;;) {
                const outcome = await runRound({
                    interaction,
                    channel: channel as GameChannel,
                    isPublic,
                    isInfinite,
                    hostId: userId,
                    color,
                    pokemonList,
                    nameIndex,
                    round,
                });

                // Round could not start: stop rather than spin on a broken sprite or API.
                if (!outcome) break;
                if (!isInfinite) break;

                // The series lives on player activity alone, so an idle round ends it.
                if (!outcome.attempted) {
                    await channel.send({
                        content: POKE_SILHOUETTE_CONSTANTS.MSG_INFINITE_STOPPED.replace("{round}", round.toString()),
                    }).catch(() => undefined);
                    break;
                }

                round++;
            }
        } finally {
            // The lock covers the whole series, not just one round.
            if (isPublic) publicGames.delete(channelId);
            else soloGames.delete(key);
        }
    },
} as SlashCommand;
