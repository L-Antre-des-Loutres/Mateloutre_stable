export const MATELOUTRE_IMAGE_CONSTANTS = {
    // Command and options
    COMMAND_NAME: "mateloutre-image",
    COMMAND_DESCRIPTION: "Génère une image de Mateloutre avec le texte de ton choix !",
    OPTION_IMAGE_NAME: "image",
    OPTION_IMAGE_DESCRIPTION: "L'image à personnaliser",
    OPTION_TEXT_NAME: "texte",
    OPTION_TEXT_DESCRIPTION: "Le texte à écrire sur l'image",

    // Data
    ASSETS_DIR: "assets",
    TEMPLATES_DIR: "mateloutreImage",
    TEMPLATES_FILE: "images.json",
    FONTS_DIR: "fonts",
    FONT_FILE: "Roboto-Bold.ttf",

    // Discord only accepts 25 choices per option
    MAX_CHOICES: 25,

    // Rendering
    RESULT_IMAGE_NAME: "mateloutre-image.png",
    FONT_FAMILY: "Roboto",

    // Text box, as a share of the source image
    TEXT_BOX_WIDTH_RATIO: 0.45,
    TEXT_BOX_HEIGHT_RATIO: 0.16,

    // The font shrinks until the text fits the box
    FONT_SIZE_MAX: 96,
    FONT_SIZE_MIN: 18,
    FONT_SIZE_STEP: 2,

    // Default spacing, each image can override it with lineHeight
    LINE_HEIGHT_RATIO: 1.15,
    STROKE_WIDTH_RATIO: 0.14,

    // Messages
    EMBED_FOOTER: "Généré avec /mateloutre-image",
    MSG_NO_TEMPLATE: "Aucune image n'est disponible pour le moment, préviens un administrateur.",
    MSG_UNKNOWN_IMAGE: "Cette image n'existe pas, choisis-en une dans la liste proposée.",
    MSG_TEXT_TOO_SHORT: "Ton texte est trop court pour cette image : il faut au moins **{min}** caractère(s).",
    MSG_TEXT_TOO_LONG: "Ton texte est trop long pour cette image : **{max}** caractères maximum.",
    MSG_IMAGE_ERROR: "Impossible de générer l'image pour le moment, réessaie plus tard.",
};

export const MATELOUTRE_IMAGE_COLORS = {
    TEXT: "#1c1c1c",
    OUTLINE: "#ffffff",
};
