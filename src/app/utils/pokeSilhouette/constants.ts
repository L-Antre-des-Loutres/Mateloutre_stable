import { POKEDLE_COLORS } from "../pokedle/constants";

export const POKE_SILHOUETTE_CONSTANTS = {
    // Command and options
    COMMAND_NAME: "poke-silhouette",
    COMMAND_DESCRIPTION: "Devine le Pokémon caché derrière sa silhouette !",
    OPTION_PUBLIC_NAME: "publique",
    OPTION_PUBLIC_DESCRIPTION: "Oui : tout le salon peut deviner. Non : toi seul. (Oui par défaut)",
    OPTION_PUBLIC_YES: "oui",
    OPTION_PUBLIC_YES_LABEL: "Oui",
    OPTION_PUBLIC_NO: "non",
    OPTION_PUBLIC_NO_LABEL: "Non",
    OPTION_INFINITE_NAME: "infini",
    OPTION_INFINITE_DESCRIPTION: "Oui : enchaîne les manches tant que quelqu'un joue. (Non par défaut)",
    OPTION_INFINITE_YES: "oui",
    OPTION_INFINITE_YES_LABEL: "Oui",
    OPTION_INFINITE_NO: "non",
    OPTION_INFINITE_NO_LABEL: "Non",

    // Images
    SILHOUETTE_IMAGE_NAME: "poke-silhouette.png",
    REVEAL_IMAGE_NAME: "poke-reveal.png",
    IMAGE_SIZE: 475,
    IMAGE_PADDING: 20,

    // Game
    GAME_DURATION_MS: 60_000,
    MAX_DRAW_ATTEMPTS: 3,
    EMOJI_CORRECT: "✅",
    EMOJI_WRONG: "❌",

    // Grace period kept open after the first correct answer. Network jitter between two
    // players stays well under this, while nobody can read and retype an answer that fast.
    TIE_WINDOW_MS: 500,
    TIE_MEDALS: ["🥇", "🥈", "🥉"],
    TIE_MEDAL_DEFAULT: "▫️",

    // Caps the podium: past this the embed description would blow Discord's 4096 char
    // limit, and setDescription would throw instead of revealing the answer.
    TIE_MAX_LISTED: 10,

    // Messages
    EMBED_TITLE: "Qui est ce Pokémon ?",
    MSG_PROMPT_PUBLIC: "Tout le monde peut deviner ! Écris le nom du Pokémon dans le salon.",
    MSG_PROMPT_SOLO: "Seul {user} peut deviner ! Écris le nom du Pokémon dans le salon.",
    FOOTER_TEXT: "Tu as {seconds} secondes • ✅ bonne réponse • ❌ mauvais Pokémon",
    EMBED_WIN_TITLE: "C'est {pokemon} !",
    MSG_WIN: "Bravo {user}, tu as trouvé **{pokemon}** en **{seconds}** secondes !",
    MSG_TIE: "Pas loin ! Vous êtes **{count}** à avoir trouvé **{pokemon}** à moins de {window} ms d'écart :\n{list}",
    MSG_TIE_LINE: "{medal} {user} - **{seconds}** secondes",
    MSG_TIE_MORE: "▫️ ... et **{count}** autres joueurs",
    FOOTER_TEXT_INFINITE: "Manche {round} • {seconds} secondes • ✅ bonne réponse • ❌ mauvais Pokémon",
    MSG_INFINITE_STOPPED: "🦦 Personne n'a tenté sa chance, la série s'arrête à **{round}** manche(s). Relancez `/poke-silhouette` pour rejouer !",
    EMBED_TIMEOUT_TITLE: "Temps écoulé !",
    MSG_TIMEOUT_PUBLIC: "Personne n'a trouvé... C'était **{pokemon}** !",
    MSG_TIMEOUT_SOLO: "Tu n'as pas trouvé... C'était **{pokemon}** !",
    MSG_GAME_IN_PROGRESS_CHANNEL: "Une partie est déjà en cours dans ce salon, attends qu'elle se termine !",
    MSG_GAME_IN_PROGRESS_SOLO: "Tu as déjà une partie en cours dans ce salon !",
    MSG_INVALID_CHANNEL: "Cette commande ne fonctionne que dans un salon textuel.",
    MSG_NO_DATA: "Désolé, impossible de charger les données des Pokémon pour le moment.",
    MSG_IMAGE_ERROR: "Impossible de générer la silhouette pour le moment, réessaie plus tard.",
};

export const POKE_SILHOUETTE_COLORS = {
    SILHOUETTE: "#000000",
    BG: POKEDLE_COLORS.BG,
};
