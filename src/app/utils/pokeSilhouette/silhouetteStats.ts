import { OtterPocketBase } from "../../../otterbots/utils/pocketbase/pocketbase";
import { withSuperuserRetry } from "../../../otterbots/utils/pocketbase/superuserRetry";
import { otterlogs } from "../../../otterbots/utils/otterlogs";
import { findDiscordUserRecordId } from "../screenshotHelper";

const GAMES_COLLECTION = "pokesilhouette_games";
const SCORES_COLLECTION = "pokesilhouette_scores";

/**
 * Collection : pokesilhouette_games — one row per round, won or not.
 */
export interface SilhouetteGameRecord {
    id: string;
    pokemon_id: number;
    pokemon_name: string;
    is_public: boolean;
    host: string;
    channel_id: string;
    guild_id: string;
    started_at: string;
    duration_ms: number;
    found: boolean;
    winners_count: number;
    created: string;
}

/**
 * Collection : pokesilhouette_scores — one row per winner of a round.
 */
export interface SilhouetteScoreRecord {
    id: string;
    game: string;
    discord_user: string;
    rank: number;
    elapsed_ms: number;
    created: string;
    expand?: { game?: SilhouetteGameRecord };
}

export interface SilhouetteWinnerInput {
    discordUserId: string;
    elapsedMs: number;
}

export interface SilhouetteGameInput {
    pokemonId: number;
    pokemonName: string;
    isPublic: boolean;
    hostDiscordId: string;
    channelId: string;
    guildId: string | null;
    startedAt: Date;
    durationMs: number;
    /** Winners already sorted fastest first. */
    winners: SilhouetteWinnerInput[];
}

export interface SilhouetteUserStats {
    wins: number;
    firstPlaces: number;
    bestMs: number;
    averageMs: number;
    lastWin: { pokemonName: string; elapsedMs: number; playedAt: string } | null;
}

export class PokeSilhouetteStatsService {
    /**
     * Enregistre une manche et le classement de ses gagnants.
     * Ne lève jamais : les statistiques ne doivent pas casser une partie.
     */
    static async recordGame(input: SilhouetteGameInput): Promise<void> {
        try {
            const pb = await OtterPocketBase.getClient();

            const hostRecordId = await findDiscordUserRecordId(input.hostDiscordId);
            if (!hostRecordId) {
                otterlogs.warn(`PokeSilhouetteStatsService: hôte ${input.hostDiscordId} introuvable — manche non enregistrée.`);
                return;
            }

            const game = await withSuperuserRetry(() =>
                pb.collection(GAMES_COLLECTION).create({
                    pokemon_id: input.pokemonId,
                    pokemon_name: input.pokemonName,
                    is_public: input.isPublic,
                    host: hostRecordId,
                    channel_id: input.channelId,
                    guild_id: input.guildId ?? "",
                    started_at: input.startedAt.toISOString(),
                    duration_ms: input.durationMs,
                    found: input.winners.length > 0,
                    winners_count: input.winners.length,
                }, { requestKey: null })
            );

            if (input.winners.length === 0) return;

            // Resolved in parallel: findDiscordUserRecordId creates the row when missing,
            // and a full podium would otherwise mean one round trip per player.
            const userRecordIds = await Promise.all(
                input.winners.map(winner => findDiscordUserRecordId(winner.discordUserId).catch(() => undefined))
            );

            await Promise.all(input.winners.map((winner, index) => {
                const userRecordId = userRecordIds[index];
                if (!userRecordId) {
                    otterlogs.warn(`PokeSilhouetteStatsService: gagnant ${winner.discordUserId} introuvable — score ignoré.`);
                    return Promise.resolve();
                }

                return withSuperuserRetry(() =>
                    pb.collection(SCORES_COLLECTION).create({
                        game: game.id,
                        discord_user: userRecordId,
                        rank: index + 1,
                        elapsed_ms: winner.elapsedMs,
                    }, { requestKey: null })
                ).catch(error => {
                    otterlogs.error(`PokeSilhouetteStatsService: score de ${winner.discordUserId} non enregistré : ${error}`);
                });
            }));
        } catch (error) {
            otterlogs.error(`PokeSilhouetteStatsService: manche non enregistrée : ${error}`);
        }
    }

    /**
     * Agrège les statistiques personnelles d'un joueur.
     * Renvoie null s'il n'a encore aucune victoire.
     */
    static async getStatsForUser(discordUserId: string): Promise<SilhouetteUserStats | null> {
        try {
            const userRecordId = await findDiscordUserRecordId(discordUserId);
            if (!userRecordId) return null;

            const pb = await OtterPocketBase.getClient();
            const scores = await pb.collection(SCORES_COLLECTION).getFullList<SilhouetteScoreRecord>({
                filter: `discord_user = "${userRecordId}"`,
                sort: "-created",
                expand: "game",
                requestKey: null,
            });

            if (scores.length === 0) return null;

            const times = scores.map(score => score.elapsed_ms);
            const last = scores[0];

            return {
                wins: scores.length,
                firstPlaces: scores.filter(score => score.rank === 1).length,
                bestMs: Math.min(...times),
                averageMs: Math.round(times.reduce((sum, value) => sum + value, 0) / times.length),
                lastWin: last.expand?.game
                    ? {
                        pokemonName: last.expand.game.pokemon_name,
                        elapsedMs: last.elapsed_ms,
                        playedAt: last.created,
                    }
                    : null,
            };
        } catch (error) {
            otterlogs.error(`PokeSilhouetteStatsService: stats indisponibles pour ${discordUserId} : ${error}`);
            return null;
        }
    }
}
