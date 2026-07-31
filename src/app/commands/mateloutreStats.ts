import {
    ChatInputCommandInteraction,
    ColorResolvable,
    EmbedBuilder,
    GuildMember,
    MessageFlags,
    SlashCommandBuilder,
} from "discord.js";
import { SlashCommand } from "../../otterbots/types";
import { MATELOUTRE_STATS_CONSTANTS } from "../utils/mateloutreStats/constants";
import { PokeSilhouetteStatsService } from "../utils/pokeSilhouette/silhouetteStats";
import { PokedleStatsService } from "../utils/pokedle/mateloutreDleStats";

/** Formats a duration in seconds with millisecond precision, French style. */
function formatSeconds(elapsedMs: number): string {
    return (Math.max(elapsedMs, 0) / 1000).toFixed(3).replace(".", ",");
}

function formatDate(value: string): string {
    return new Date(value).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Statistiques de /poke-silhouette : victoires, podiums et temps de réponse.
 */
async function buildSilhouetteEmbed(discordUserId: string, displayName: string, color: ColorResolvable): Promise<EmbedBuilder | string> {
    const stats = await PokeSilhouetteStatsService.getStatsForUser(discordUserId);
    if (!stats) return MATELOUTRE_STATS_CONSTANTS.SILHOUETTE_EMPTY;

    const seconds = (value: number): string =>
        MATELOUTRE_STATS_CONSTANTS.SILHOUETTE_VALUE_SECONDS.replace("{seconds}", formatSeconds(value));

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(MATELOUTRE_STATS_CONSTANTS.SILHOUETTE_TITLE.replace("{username}", displayName))
        .addFields(
            { name: MATELOUTRE_STATS_CONSTANTS.SILHOUETTE_FIELD_WINS, value: `**${stats.wins}**`, inline: true },
            { name: MATELOUTRE_STATS_CONSTANTS.SILHOUETTE_FIELD_FIRST, value: `**${stats.firstPlaces}**`, inline: true },
            { name: MATELOUTRE_STATS_CONSTANTS.SILHOUETTE_FIELD_BEST, value: seconds(stats.bestMs), inline: true },
            { name: MATELOUTRE_STATS_CONSTANTS.SILHOUETTE_FIELD_AVERAGE, value: seconds(stats.averageMs), inline: true },
        )
        .setFooter({ text: MATELOUTRE_STATS_CONSTANTS.FOOTER });

    if (stats.lastWin) {
        embed.addFields({
            name: MATELOUTRE_STATS_CONSTANTS.SILHOUETTE_FIELD_LAST,
            value: MATELOUTRE_STATS_CONSTANTS.SILHOUETTE_VALUE_LAST
                .replace("{pokemon}", stats.lastWin.pokemonName)
                .replace("{date}", formatDate(stats.lastWin.playedAt))
                .replace("{seconds}", formatSeconds(stats.lastWin.elapsedMs)),
            inline: false,
        });
    }

    return embed;
}

/**
 * Statistiques de /pokedeviner : victoires et nombre d'essais.
 */
async function buildPokedevinerEmbed(discordUserId: string, displayName: string, color: ColorResolvable): Promise<EmbedBuilder | string> {
    const stats = await PokedleStatsService.getStatsForUser(discordUserId);
    if (stats.length === 0) return MATELOUTRE_STATS_CONSTANTS.POKEDEVINER_EMPTY;

    const totalWins = stats.length;
    const bestTry = Math.min(...stats.map(s => s.nb_try));
    const averageTries = (stats.reduce((acc, s) => acc + s.nb_try, 0) / totalWins).toFixed(1);
    const lastWin = stats[0]; // déjà trié par -created

    return new EmbedBuilder()
        .setColor(color)
        .setTitle(MATELOUTRE_STATS_CONSTANTS.POKEDEVINER_TITLE.replace("{username}", displayName))
        .addFields(
            { name: MATELOUTRE_STATS_CONSTANTS.POKEDEVINER_FIELD_WINS, value: `**${totalWins}**`, inline: true },
            {
                name: MATELOUTRE_STATS_CONSTANTS.POKEDEVINER_FIELD_BEST,
                value: MATELOUTRE_STATS_CONSTANTS.POKEDEVINER_VALUE_TRIES.replace("{count}", bestTry.toString()),
                inline: true,
            },
            {
                name: MATELOUTRE_STATS_CONSTANTS.POKEDEVINER_FIELD_AVERAGE,
                value: MATELOUTRE_STATS_CONSTANTS.POKEDEVINER_VALUE_AVERAGE.replace("{count}", averageTries),
                inline: true,
            },
            {
                name: MATELOUTRE_STATS_CONSTANTS.POKEDEVINER_FIELD_LAST,
                value: MATELOUTRE_STATS_CONSTANTS.POKEDEVINER_VALUE_LAST
                    .replace("{pokemon}", lastWin.pokemon_name)
                    .replace("{date}", formatDate(lastWin.created))
                    .replace("{count}", lastWin.nb_try.toString()),
                inline: false,
            },
        )
        .setFooter({ text: MATELOUTRE_STATS_CONSTANTS.FOOTER });
}

export default {
    name: MATELOUTRE_STATS_CONSTANTS.COMMAND_NAME,
    autocomplete: false,
    data: new SlashCommandBuilder()
        .setName(MATELOUTRE_STATS_CONSTANTS.COMMAND_NAME)
        .setDescription(MATELOUTRE_STATS_CONSTANTS.COMMAND_DESCRIPTION)
        .addStringOption(opt =>
            opt.setName(MATELOUTRE_STATS_CONSTANTS.OPTION_GAME_NAME)
                .setDescription(MATELOUTRE_STATS_CONSTANTS.OPTION_GAME_DESCRIPTION)
                .setRequired(true)
                .addChoices(
                    { name: MATELOUTRE_STATS_CONSTANTS.GAME_SILHOUETTE_LABEL, value: MATELOUTRE_STATS_CONSTANTS.GAME_SILHOUETTE },
                    { name: MATELOUTRE_STATS_CONSTANTS.GAME_POKEDEVINER_LABEL, value: MATELOUTRE_STATS_CONSTANTS.GAME_POKEDEVINER },
                )
        ) as SlashCommandBuilder,

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const game = interaction.options.getString(MATELOUTRE_STATS_CONSTANTS.OPTION_GAME_NAME, true);
        const displayName = interaction.member instanceof GuildMember
            ? interaction.member.displayName
            : interaction.user.displayName;
        const color = (process.env.BOT_COLOR || "#f89800") as ColorResolvable;

        const result = game === MATELOUTRE_STATS_CONSTANTS.GAME_SILHOUETTE
            ? await buildSilhouetteEmbed(interaction.user.id, displayName, color)
            : await buildPokedevinerEmbed(interaction.user.id, displayName, color);

        if (typeof result === "string") {
            await interaction.editReply({ content: result });
            return;
        }

        await interaction.editReply({ embeds: [result] });
    },
} as SlashCommand;
