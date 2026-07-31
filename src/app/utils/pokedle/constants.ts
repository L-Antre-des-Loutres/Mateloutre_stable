export const POKEDLE_CONSTANTS = {
    // Files and Cache
    CACHE_FILE_NAME: "pokedle.json",
    POKEMON_DATA_PATH: "../data/pokemon.json",
    RESULT_IMAGE_NAME: "pokedle-result.png",

    // Commands and Subcommands
    COMMAND_NAME: "pokedeviner",
    COMMAND_DESCRIPTION: "Joue au Pokémon Deviner quotidien !",
    SUBCOMMAND_GUESS_NAME: "deviner",
    SUBCOMMAND_GUESS_DESCRIPTION: "Devine le Pokémon du jour",
    SUBCOMMAND_VIEW_NAME: "voir",
    SUBCOMMAND_VIEW_DESCRIPTION: "Affiche publiquement ton DLE actuel",
    OPTION_POKEMON_NAME: "nom",
    OPTION_POKEMON_DESCRIPTION: "Le nom du Pokémon",

    // Messages
    MSG_NOT_IN_LIST: "Ce Pokémon n'est pas dans ma liste !",
    MSG_ALREADY_TRIED: "Tu as déjà essayé ce Pokémon aujourd'hui !",
    MSG_ALREADY_WON: "Tu as déjà trouvé le Pokémon du jour (**{target}**) ! Reviens demain pour un nouveau défi.",
    MSG_WIN_TITLE: "Bravo !",
    MSG_WIN_CONTENT: "Tu as trouvé **{target}** en {attempts} essais !",
    MSG_STATS_COMING: "Les statistiques arrivent bientôt !",
    MSG_ERROR_AUTOCOMPLETE: "⚠️ Erreur lors de l’autocomplétion",
    
    // Embed and Image Labels
    EMBED_TITLE: "PokeDeviner - {date}",
    IMAGE_TITLE: "PokeDeviner de {username}",
    IMAGE_DEFAULT_TITLE: "PokeDeviner",
    FOOTER_TEXT: "Essai {count} • 🟩 Bon • 🟨 Mal placé • 🟥 Mauvais • 🔼 Plus grand • 🔽 Plus petit",
    FOOTER_WON_TEXT: "Partie terminée en {count} essais",
    
    // Table Headers
    HEADER_POKEMON: "Pokémon",
    HEADER_TYPE1: "Type 1",
    HEADER_TYPE2: "Type 2",
    HEADER_GEN: "Gen",
    HEADER_HEIGHT: "Taille",
    HEADER_WEIGHT: "Poids",

    // Units
    UNIT_HEIGHT: "m",
    UNIT_WEIGHT: "kg"
};

export const POKEDLE_COLORS = {
    EXACT: "#3ba55c",
    PARTIAL: "#faa61a",
    WRONG: "#ed4245",
    BG: "#2f3136",
    TEXT: "#ffffff",
    BORDER: "#4f545c"
};

export const POKEDLE_EMOJIS = {
    HIGHER: "▲",
    LOWER: "▼",
    CHECK: "✓"
};
