import {
    ChatInputCommandInteraction,
    EmbedBuilder,
    SlashCommandBuilder,
    AutocompleteInteraction,
    ColorResolvable,
    AttachmentBuilder,
    GuildMember,
    TextBasedChannel,
    Message,
    MessagePayload,
    MessageCreateOptions,
    MessageFlags,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from "discord.js";
import { SlashCommand } from "../../otterbots/types";
import { generatePokedleImage } from "../utils/pokedle/imageGenerator";
import { OtterCache } from "../../otterbots/utils/ottercache/ottercache";
import { POKEDLE_CONSTANTS } from "../utils/pokedle/constants";
import { PapiService } from "../utils/papi/papiService";
import { PokemonData } from "../utils/pokedle/gameLogic";
import { PokedleStatsService } from "../utils/pokedle/mateloutreDleStats";
import { OtterPocketBase } from "../../otterbots/utils/pocketbase/pocketbase";
import { otterlogs } from "../../otterbots/utils/otterlogs";

export interface PokedleSession {
    attemptsIds: number[];
    messageId?: string;
    channelId?: string;
    pbRecordId?: string; // ID of the PocketBase record
    targetPokemonId?: number;
    startedAt?: string;
}

export interface PokedleDailyState {
    currentGameId: number;
}

type SendableChannel = TextBasedChannel & { send(options: string | MessagePayload | MessageCreateOptions): Promise<Message> };

const pokedleCache = new OtterCache<PokedleSession | number[] | PokedleDailyState>(POKEDLE_CONSTANTS.CACHE_FILE_NAME);

export default {
    name: POKEDLE_CONSTANTS.COMMAND_NAME,
    data: new SlashCommandBuilder()
        .setName(POKEDLE_CONSTANTS.COMMAND_NAME)
        .setDescription(POKEDLE_CONSTANTS.COMMAND_DESCRIPTION)
        .addSubcommand(sub =>
            sub.setName(POKEDLE_CONSTANTS.SUBCOMMAND_GUESS_NAME)
                .setDescription(POKEDLE_CONSTANTS.SUBCOMMAND_GUESS_DESCRIPTION)
                .addStringOption(opt =>
                    opt.setName(POKEDLE_CONSTANTS.OPTION_POKEMON_NAME)
                        .setDescription(POKEDLE_CONSTANTS.OPTION_POKEMON_DESCRIPTION)
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName(POKEDLE_CONSTANTS.SUBCOMMAND_VIEW_NAME)
                .setDescription(POKEDLE_CONSTANTS.SUBCOMMAND_VIEW_DESCRIPTION)
        ) as SlashCommandBuilder,

    async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
        // Use cached pokemon for autocomplete to avoid DiscordAPIError[10062] timeout
        const pokemonList = PapiService.getCachedPokemonForPokedle();
        if (!pokemonList || pokemonList.length === 0) {
            await interaction.respond([]);
            return;
        }

        const focusedValue = interaction.options.getFocused().toLowerCase();
        
        let choices: PokemonData[];
        if (focusedValue === "") {
            choices = pokemonList.slice(0, 25);
        } else {
            choices = pokemonList
                .filter(p => p.name.toLowerCase().includes(focusedValue))
                .sort((a, b) => {
                    const aName = a.name.toLowerCase();
                    const bName = b.name.toLowerCase();
                    const aStarts = aName.startsWith(focusedValue);
                    const bStarts = bName.startsWith(focusedValue);
                    
                    if (aStarts && !bStarts) return -1;
                    if (!aStarts && bStarts) return 1;
                    
                    return aName.localeCompare(bName);
                })
                .slice(0, 25);
        }
        
        await interaction.respond(
            choices.map(p => ({ name: p.name, value: p.name }))
        );
    },

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const subcommand = interaction.options.getSubcommand();
        const userId = interaction.user.id;
        const now = new Date();
        
        const todayISO = now.toLocaleDateString('en-CA'); 
        const todayFR = now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        
        const dailyStateKey = `dailyState_${userId}_${todayISO}`;
        const dailyState: PokedleDailyState = (pokedleCache.get(dailyStateKey) as PokedleDailyState) || { currentGameId: 0 };
        
        // Backward compatibility for old cache key
        let cacheKey = `session_${userId}_${todayISO}_${dailyState.currentGameId}`;
        if (dailyState.currentGameId === 0 && pokedleCache.get(`${userId}_${todayISO}`)) {
            cacheKey = `${userId}_${todayISO}`;
        }

        const sessionRaw = pokedleCache.get(cacheKey);
        let session: PokedleSession = { attemptsIds: [], startedAt: now.toISOString() };
        if (sessionRaw) {
            if (Array.isArray(sessionRaw)) {
                session.attemptsIds = sessionRaw;
                session.startedAt = now.toISOString();
            } else {
                session = sessionRaw as PokedleSession;
                if (!session.startedAt) session.startedAt = now.toISOString();
            }
        }

        let expiredPrefix = "";
        if (session.startedAt) {
            const startedDate = new Date(session.startedAt);
            const diffHours = (now.getTime() - startedDate.getTime()) / (1000 * 60 * 60);
            
            // Si la partie date de plus de 6h, n'est pas déjà gagnée (pas supprimée du cache)
            if (diffHours >= 6 && session.attemptsIds.length > 0) {
                // Marquer dans PB comme expiré
                if (session.pbRecordId) {
                    try {
                        const pb = await OtterPocketBase.getClient();
                        await pb.collection('pokedeviner_stats').update(session.pbRecordId, { is_expired: true }, { requestKey: null });
                    } catch (e) {
                        otterlogs.error(`Impossible d'expirer la partie ${session.pbRecordId} dans PB: ${e}`);
                    }
                }
                
                // Réinitialiser la session
                pokedleCache.delete(cacheKey);
                // On garde le même ID de partie du jour, on repart juste à zéro
                session = { attemptsIds: [], startedAt: now.toISOString() };
                expiredPrefix = "⏳ **Ta partie précédente a expiré (plus de 6h d'inactivité).**\n";
            }
        }

        const attemptsIds = session.attemptsIds;
        const isFirstGuess = attemptsIds.length === 0 && subcommand === POKEDLE_CONSTANTS.SUBCOMMAND_GUESS_NAME;

        await interaction.deferReply({ flags: !isFirstGuess ? MessageFlags.Ephemeral : undefined });

        const pokemonList = await PapiService.getAllPokemonForPokedle();
        if (pokemonList.length === 0) {
            await interaction.editReply({ content: "Désolé, impossible de charger les données des Pokémon pour le moment." });
            return;
        }

        if (!session.targetPokemonId) {
            const targetIndex = Math.floor(Math.random() * pokemonList.length);
            session.targetPokemonId = pokemonList[targetIndex].id;
            
            // On le sauvegarde immediatement si on ne va pas set la session plus bas.
            if (subcommand !== POKEDLE_CONSTANTS.SUBCOMMAND_GUESS_NAME) {
                pokedleCache.set(cacheKey, session);
            }
        }

        const targetPokemon = pokemonList.find(p => p.id === session.targetPokemonId)!;

        const displayName = interaction.member instanceof GuildMember 
            ? interaction.member.displayName 
            : interaction.user.displayName;

        if (subcommand === POKEDLE_CONSTANTS.SUBCOMMAND_GUESS_NAME) {
            const guessName = interaction.options.getString(POKEDLE_CONSTANTS.OPTION_POKEMON_NAME, true);
            const guessPokemon = pokemonList.find(p => p.name.toLowerCase() === guessName.toLowerCase());

            if (!guessPokemon) {
                await interaction.editReply({ content: POKEDLE_CONSTANTS.MSG_NOT_IN_LIST });
                return;
            }

            if (attemptsIds.includes(targetPokemon.id)) {
                const msgLink = session.messageId && session.channelId ? `\n[Voir ton Pokedle public](https://discord.com/channels/${interaction.guildId}/${session.channelId}/${session.messageId})` : "";
                await interaction.editReply({ content: POKEDLE_CONSTANTS.MSG_ALREADY_WON.replace("{target}", targetPokemon.name) + msgLink });
                return;
            }

            if (attemptsIds.includes(guessPokemon.id)) {
                await interaction.editReply({ content: POKEDLE_CONSTANTS.MSG_ALREADY_TRIED });
                return;
            }

            attemptsIds.push(guessPokemon.id);
            session.attemptsIds = attemptsIds;

            const isWin = guessPokemon.id === targetPokemon.id;
            
            // Sync with PocketBase
            const tryListNames = attemptsIds.map(id => pokemonList.find(p => p.id === id)?.name).filter(Boolean) as string[];
            const pbRecordId = await PokedleStatsService.syncGame(userId, targetPokemon.name, tryListNames, isWin, session.pbRecordId);
            if (pbRecordId) {
                session.pbRecordId = pbRecordId;
            }

            // Génération de l'image
            const attemptsPokemon = attemptsIds.map(id => pokemonList.find(p => p.id === id)!);
            const avatarUrl = interaction.user.displayAvatarURL({ extension: 'png', size: 128 });
            const imageBuffer = await generatePokedleImage(attemptsPokemon, targetPokemon, avatarUrl, displayName);
            const attachment = new AttachmentBuilder(imageBuffer, { name: POKEDLE_CONSTANTS.RESULT_IMAGE_NAME });

            const embed = new EmbedBuilder()
                .setTitle(POKEDLE_CONSTANTS.EMBED_TITLE.replace("{date}", todayFR))
                .setColor((process.env.BOT_COLOR || "#f89800") as ColorResolvable)
                .setImage(`attachment://${POKEDLE_CONSTANTS.RESULT_IMAGE_NAME}`)
                .setFooter({ 
                    text: isWin 
                        ? POKEDLE_CONSTANTS.FOOTER_WON_TEXT.replace("{count}", attemptsIds.length.toString())
                        : POKEDLE_CONSTANTS.FOOTER_TEXT.replace("{count}", attemptsIds.length.toString()) 
                });

            if (isWin) {
                let winText = `Tu as trouvé **${targetPokemon.name}** en **${attemptsIds.length}** essais !`;
                if (dailyState.currentGameId === 0) {
                    winText += `\n\n🎁 **Points quotidiens obtenus !**\nTu peux continuer à jouer avec \`/pokedeviner deviner\`, mais tu devras revenir demain pour obtenir de nouveaux points.`;
                } else {
                    winText += `\n\n*(Partie supplémentaire : aucun point accordé, reviens demain !)*`;
                }
                
                embed.addFields({ 
                    name: POKEDLE_CONSTANTS.MSG_WIN_TITLE, 
                    value: winText
                });
                
                // Increment game id for the NEXT game
                dailyState.currentGameId++;
                pokedleCache.set(dailyStateKey, dailyState);
            }

            let components: ActionRowBuilder<ButtonBuilder>[] = [];
            if (isWin) {
                const row = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('pokedle_reminder_btn')
                            .setLabel('🔔 Rappel demain')
                            .setStyle(ButtonStyle.Success)
                    );
                components = [row];
            }

            if (isFirstGuess) {
                const content = expiredPrefix ? expiredPrefix : null;
                const msg = await interaction.editReply({ content, embeds: [embed], files: [attachment], components });
                session.messageId = msg.id;
                session.channelId = msg.channelId;
                if (isWin) {
                    pokedleCache.delete(cacheKey);
                } else {
                    pokedleCache.set(cacheKey, session);
                }
            } else {
                let edited = false;
                let msgLink = "";
                
                if (session.messageId && session.channelId) {
                    try {
                        const channel = await interaction.client.channels.fetch(session.channelId);
                        if (channel && channel.isTextBased() && 'messages' in channel) {
                            const msg = await channel.messages.fetch(session.messageId);
                            if (msg) {
                                await msg.edit({ embeds: [embed], files: [attachment], components });
                                edited = true;
                                msgLink = `https://discord.com/channels/${interaction.guildId}/${session.channelId}/${session.messageId}`;
                            }
                        }
                    } catch (e) {
                        console.error("Impossible d'éditer le message Pokedle original", e);
                    }
                }

                if (isWin) {
                    pokedleCache.delete(cacheKey);
                } else {
                    pokedleCache.set(cacheKey, session);
                }

                if (edited) {
                    if (isWin) {
                        await interaction.editReply({ content: `🎉 Bravo ! Ton [Pokedle public](${msgLink}) a été mis à jour avec ta victoire.` });
                        const channel = await interaction.client.channels.fetch(session.channelId!);
                        if (channel && channel.isTextBased() && 'send' in channel) {
                            await (channel as SendableChannel).send({ content: `GG <@${interaction.user.id}> ! Tu as trouvé le Pokémon du jour : **${targetPokemon.name}** en **${attemptsIds.length}** essais !` });
                        }
                    } else {
                        await interaction.editReply({ content: `Essai pris en compte ! Ton [Pokedle public](${msgLink}) a été mis à jour.` });
                    }
                } else {
                    await interaction.editReply({ content: "Voici ton Pokedle (le message original est introuvable) :", embeds: [embed], files: [attachment], components });
                }
            }

        } else if (subcommand === POKEDLE_CONSTANTS.SUBCOMMAND_VIEW_NAME) {
            if (attemptsIds.length === 0) {
                await interaction.editReply({ content: expiredPrefix + "Tu n'as pas encore commencé ta partie d'aujourd'hui !" });
                return;
            }

            const attemptsPokemon = attemptsIds.map(id => pokemonList.find(p => p.id === id)!);
            const avatarUrl = interaction.user.displayAvatarURL({ extension: 'png', size: 128 });
            const imageBuffer = await generatePokedleImage(attemptsPokemon, targetPokemon, avatarUrl, displayName);
            const attachment = new AttachmentBuilder(imageBuffer, { name: POKEDLE_CONSTANTS.RESULT_IMAGE_NAME });

            const isWon = attemptsIds.includes(targetPokemon.id);

            const embed = new EmbedBuilder()
                .setTitle(POKEDLE_CONSTANTS.EMBED_TITLE.replace("{date}", todayFR))
                .setColor((process.env.BOT_COLOR || "#f89800") as ColorResolvable)
                .setImage(`attachment://${POKEDLE_CONSTANTS.RESULT_IMAGE_NAME}`)
                .setFooter({ 
                    text: isWon 
                        ? POKEDLE_CONSTANTS.FOOTER_WON_TEXT.replace("{count}", attemptsIds.length.toString())
                        : POKEDLE_CONSTANTS.FOOTER_TEXT.replace("{count}", attemptsIds.length.toString()) 
                });

            if (isWon) {
                embed.setDescription(`Partie terminée ! Le Pokémon était **${targetPokemon.name}**.`);
            }

            await interaction.editReply({ embeds: [embed], files: [attachment] });
        }
    }
} as SlashCommand;


