import {
    AttachmentBuilder,
    ChatInputCommandInteraction,
    ColorResolvable,
    EmbedBuilder,
    Message,
    MessageFlags,
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
        ) as SlashCommandBuilder,

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const channel = interaction.channel;
        if (!channel || !channel.isTextBased() || !("createMessageCollector" in channel)) {
            await interaction.reply({
                content: POKE_SILHOUETTE_CONSTANTS.MSG_INVALID_CHANNEL,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const publicOption = interaction.options.getString(POKE_SILHOUETTE_CONSTANTS.OPTION_PUBLIC_NAME);
        const isPublic = (publicOption ?? POKE_SILHOUETTE_CONSTANTS.OPTION_PUBLIC_YES) === POKE_SILHOUETTE_CONSTANTS.OPTION_PUBLIC_YES;

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

        const release = (): void => {
            if (isPublic) publicGames.delete(channelId);
            else soloGames.delete(key);
        };

        let collectorStarted = false;

        try {
            await interaction.deferReply();

            const pokemonList = await PapiService.getAllPokemonForPokedle();
            if (pokemonList.length === 0) {
                await interaction.editReply({ content: POKE_SILHOUETTE_CONSTANTS.MSG_NO_DATA });
                return;
            }

            const draw = await drawPlayablePokemon(pokemonList);
            if (!draw) {
                await interaction.editReply({ content: POKE_SILHOUETTE_CONSTANTS.MSG_IMAGE_ERROR });
                return;
            }

            const { pokemon, images } = draw;
            const color = (process.env.BOT_COLOR || "#f89800") as ColorResolvable;
            const seconds = POKE_SILHOUETTE_CONSTANTS.GAME_DURATION_MS / 1000;

            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle(POKE_SILHOUETTE_CONSTANTS.EMBED_TITLE)
                .setDescription(isPublic
                    ? POKE_SILHOUETTE_CONSTANTS.MSG_PROMPT_PUBLIC
                    : POKE_SILHOUETTE_CONSTANTS.MSG_PROMPT_SOLO.replace("{user}", `<@${userId}>`))
                .setImage(`attachment://${POKE_SILHOUETTE_CONSTANTS.SILHOUETTE_IMAGE_NAME}`)
                .setFooter({ text: POKE_SILHOUETTE_CONSTANTS.FOOTER_TEXT.replace("{seconds}", seconds.toString()) });

            await interaction.editReply({
                embeds: [embed],
                files: [new AttachmentBuilder(images.silhouette, { name: POKE_SILHOUETTE_CONSTANTS.SILHOUETTE_IMAGE_NAME })],
            });

            const nameIndex = buildNameIndex(pokemonList);
            const targetKey = normalizeName(pokemon.name);
            const startedAt = Date.now();
            const winners: SilhouetteWinner[] = [];
            let tieTimer: NodeJS.Timeout | null = null;

            const collector = channel.createMessageCollector({
                filter: (message: Message) => !message.author.bot && (isPublic || message.author.id === userId),
                time: POKE_SILHOUETTE_CONSTANTS.GAME_DURATION_MS,
            });

            collector.on("collect", async (message: Message) => {
                const guess = normalizeName(message.content.trim());
                if (!guess) return;

                if (guess === targetKey) {
                    // Everything below runs before the first await, so two answers landing in
                    // the same tick cannot overwrite each other.
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
                    await message.react(POKE_SILHOUETTE_CONSTANTS.EMOJI_WRONG).catch(() => undefined);
                }
            });

            collector.on("end", async () => {
                // The game can also end on timeout while the tie window is still pending.
                if (tieTimer) {
                    clearTimeout(tieTimer);
                    tieTimer = null;
                }
                release();

                try {
                    winners.sort((a, b) => a.elapsedMs - b.elapsedMs);

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
                    await interaction.editReply({
                        embeds: [revealEmbed],
                        files: [new AttachmentBuilder(images.reveal, { name: POKE_SILHOUETTE_CONSTANTS.REVEAL_IMAGE_NAME })],
                        attachments: [],
                    });
                } catch (error) {
                    otterlogs.error(`Impossible de révéler le Pokémon de poke-silhouette: ${error}`);
                }

                // Recorded last, and on its own: PocketBase being down must never cost the
                // players their reveal. The service swallows its own errors.
                await PokeSilhouetteStatsService.recordGame({
                    pokemonId: pokemon.id,
                    pokemonName: pokemon.name,
                    isPublic,
                    hostDiscordId: userId,
                    channelId,
                    guildId: interaction.guildId,
                    startedAt: new Date(startedAt),
                    durationMs: POKE_SILHOUETTE_CONSTANTS.GAME_DURATION_MS,
                    winners: winners.map(winner => ({ discordUserId: winner.userId, elapsedMs: winner.elapsedMs })),
                });
            });

            collectorStarted = true;
        } finally {
            // Once the collector runs it owns the lock and frees it on "end".
            if (!collectorStarted) release();
        }
    },
} as SlashCommand;
