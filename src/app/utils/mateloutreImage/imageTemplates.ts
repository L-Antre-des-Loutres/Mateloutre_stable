import fs from "fs";
import path from "path";
import { MATELOUTRE_IMAGE_CONSTANTS } from "./constants";
import { otterlogs } from "../../../otterbots/utils/otterlogs";

/** One entry of assets/mateloutreImage/images.json. */
export interface MateloutreImageTemplate {
    /** Choice value stored by Discord, must stay stable */
    id: string;
    label: string;
    /** PNG path, relative to the assets folder */
    image: string;
    minChara: number;
    maxChara: number;
    /** Centre of the text block, in pixels */
    textPositionX: number;
    textPositionY: number;
    /** Clockwise, in degrees */
    rotation: number;
    /** Line spacing as a multiple of the font size, optional in the JSON */
    lineHeight: number;
}

const STRING_FIELDS = ["id", "label", "image"] as const;
const NUMBER_FIELDS = ["minChara", "maxChara", "textPositionX", "textPositionY", "rotation"] as const;

const templatesPath = path.join(
    process.cwd(),
    MATELOUTRE_IMAGE_CONSTANTS.ASSETS_DIR,
    MATELOUTRE_IMAGE_CONSTANTS.TEMPLATES_DIR,
    MATELOUTRE_IMAGE_CONSTANTS.TEMPLATES_FILE,
);

// Read once, at the startup of the command
let cache: MateloutreImageTemplate[] | null = null;

/** A malformed entry is dropped instead of breaking the whole command. */
function parseTemplate(value: unknown): MateloutreImageTemplate | null {
    if (typeof value !== "object" || value === null) return null;
    const raw = value as Record<string, unknown>;

    for (const field of STRING_FIELDS) {
        if (typeof raw[field] !== "string" || raw[field] === "") return null;
    }
    for (const field of NUMBER_FIELDS) {
        if (typeof raw[field] !== "number" || !Number.isFinite(raw[field])) return null;
    }

    const lineHeight = raw.lineHeight ?? MATELOUTRE_IMAGE_CONSTANTS.LINE_HEIGHT_RATIO;
    if (typeof lineHeight !== "number" || !Number.isFinite(lineHeight) || lineHeight <= 0) return null;

    const template: MateloutreImageTemplate = { ...(raw as unknown as MateloutreImageTemplate), lineHeight };

    // A reversed range would make the image unusable
    if (template.minChara < 1 || template.maxChara < template.minChara) return null;

    return template;
}

/** Reads the image list, keeping only the usable entries. */
export function getImageTemplates(): MateloutreImageTemplate[] {
    if (cache) return cache;

    try {
        const content = JSON.parse(fs.readFileSync(templatesPath, "utf-8")) as { images?: unknown };
        const entries = Array.isArray(content.images) ? content.images : [];

        const templates: MateloutreImageTemplate[] = [];
        for (const entry of entries) {
            const template = parseTemplate(entry);
            if (template) templates.push(template);
            else otterlogs.warn(`mateloutre-image: entrée ignorée dans ${MATELOUTRE_IMAGE_CONSTANTS.TEMPLATES_FILE}`);
        }

        if (templates.length === 0) otterlogs.warn(`mateloutre-image: aucune image utilisable dans ${templatesPath}`);

        cache = templates;
    } catch (error) {
        otterlogs.error(`mateloutre-image: lecture de ${templatesPath} impossible : ` + error);
        cache = [];
    }

    return cache;
}

export function findImageTemplate(id: string): MateloutreImageTemplate | undefined {
    return getImageTemplates().find(template => template.id === id);
}

/** Command choices, capped to what Discord accepts. */
export function imageChoices(): { name: string; value: string }[] {
    return getImageTemplates()
        .slice(0, MATELOUTRE_IMAGE_CONSTANTS.MAX_CHOICES)
        .map(template => ({ name: template.label, value: template.id }));
}

/** Widest bounds of all images: the option limits cannot vary per choice. */
export function textLengthBounds(): { min: number; max: number } {
    const templates = getImageTemplates();
    if (templates.length === 0) return { min: 1, max: 100 };

    return {
        min: Math.min(...templates.map(t => t.minChara)),
        max: Math.max(...templates.map(t => t.maxChara)),
    };
}

export function templateImagePath(template: MateloutreImageTemplate): string {
    return path.join(process.cwd(), MATELOUTRE_IMAGE_CONSTANTS.ASSETS_DIR, template.image);
}
