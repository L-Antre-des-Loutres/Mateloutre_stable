import { createCanvas, loadImage, registerFont, CanvasRenderingContext2D } from "canvas";
import path from "path";
import { MATELOUTRE_IMAGE_COLORS, MATELOUTRE_IMAGE_CONSTANTS } from "./constants";
import { MateloutreImageTemplate, templateImagePath } from "./imageTemplates";

// Font registration for Linux/Docker
const fontPath = path.join(
    process.cwd(),
    MATELOUTRE_IMAGE_CONSTANTS.ASSETS_DIR,
    MATELOUTRE_IMAGE_CONSTANTS.FONTS_DIR,
    MATELOUTRE_IMAGE_CONSTANTS.FONT_FILE,
);
registerFont(fontPath, { family: MATELOUTRE_IMAGE_CONSTANTS.FONT_FAMILY, weight: "bold" });

const fontOf = (fontSize: number): string => `bold ${fontSize}px ${MATELOUTRE_IMAGE_CONSTANTS.FONT_FAMILY}`;

interface TextLayout {
    fontSize: number;
    lines: string[];
}

/** Splits a word wider than the box so it never overflows on its own. */
function breakWord(ctx: CanvasRenderingContext2D, word: string, maxWidth: number): string[] {
    const chunks: string[] = [];
    let current = "";

    for (const char of word) {
        if (current !== "" && ctx.measureText(current + char).width > maxWidth) {
            chunks.push(current);
            current = char;
        } else {
            current += char;
        }
    }

    if (current !== "") chunks.push(current);
    return chunks;
}

/** Greedy wrapping at the current font. `broken` means a word had to be cut. */
function wrapText(
    ctx: CanvasRenderingContext2D,
    words: string[],
    maxWidth: number
): { lines: string[]; broken: boolean } {
    const lines: string[] = [];
    let current = "";
    let broken = false;

    for (const word of words) {
        const candidate = current === "" ? word : `${current} ${word}`;

        if (ctx.measureText(candidate).width <= maxWidth) {
            current = candidate;
            continue;
        }

        if (current !== "") lines.push(current);

        if (ctx.measureText(word).width <= maxWidth) {
            current = word;
        } else {
            const chunks = breakWord(ctx, word, maxWidth);
            lines.push(...chunks.slice(0, -1));
            current = chunks[chunks.length - 1] ?? "";
            broken = true;
        }
    }

    if (current !== "") lines.push(current);
    return { lines, broken };
}

/** Biggest font size whose wrapped text fits the box, floored at FONT_SIZE_MIN. */
function fitText(
    ctx: CanvasRenderingContext2D,
    text: string,
    boxWidth: number,
    boxHeight: number,
    lineHeightRatio: number
): TextLayout {
    const words = text.split(/\s+/).filter(word => word !== "");
    const { FONT_SIZE_MAX, FONT_SIZE_MIN, FONT_SIZE_STEP } = MATELOUTRE_IMAGE_CONSTANTS;

    let layout: TextLayout = { fontSize: FONT_SIZE_MIN, lines: words };

    for (let fontSize = FONT_SIZE_MAX; fontSize >= FONT_SIZE_MIN; fontSize -= FONT_SIZE_STEP) {
        ctx.font = fontOf(fontSize);
        const { lines, broken } = wrapText(ctx, words, boxWidth);
        layout = { fontSize, lines };

        if (!broken && lines.length * fontSize * lineHeightRatio <= boxHeight) return layout;
    }

    return layout;
}

/** Draws the text on the image of the template, centred on (textPositionX, textPositionY). */
export async function renderTemplateImage(template: MateloutreImageTemplate, text: string): Promise<Buffer> {
    const background = await loadImage(templateImagePath(template));

    const canvas = createCanvas(background.width, background.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(background, 0, 0);

    const boxWidth = background.width * MATELOUTRE_IMAGE_CONSTANTS.TEXT_BOX_WIDTH_RATIO;
    const boxHeight = background.height * MATELOUTRE_IMAGE_CONSTANTS.TEXT_BOX_HEIGHT_RATIO;
    const { fontSize, lines } = fitText(ctx, text, boxWidth, boxHeight, template.lineHeight);

    const lineHeight = fontSize * template.lineHeight;
    const blockHeight = lines.length * lineHeight;

    ctx.save();
    ctx.translate(template.textPositionX, template.textPositionY);
    ctx.rotate((template.rotation * Math.PI) / 180);

    ctx.font = fontOf(fontSize);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = fontSize * MATELOUTRE_IMAGE_CONSTANTS.STROKE_WIDTH_RATIO;
    ctx.strokeStyle = MATELOUTRE_IMAGE_COLORS.OUTLINE;
    ctx.fillStyle = MATELOUTRE_IMAGE_COLORS.TEXT;

    lines.forEach((line, index) => {
        const y = -blockHeight / 2 + lineHeight / 2 + index * lineHeight;
        // Outline first, it would eat the glyphs otherwise
        ctx.strokeText(line, 0, y);
        ctx.fillText(line, 0, y);
    });

    ctx.restore();

    return canvas.toBuffer();
}
