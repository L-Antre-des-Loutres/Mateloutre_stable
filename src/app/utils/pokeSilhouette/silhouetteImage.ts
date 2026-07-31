import { createCanvas, CanvasRenderingContext2D, Image } from 'canvas';
import { PokemonData } from '../pokedle/gameLogic';
import { loadSprite } from '../papi/spriteLoader';
import { POKE_SILHOUETTE_COLORS, POKE_SILHOUETTE_CONSTANTS } from './constants';
import { otterlogs } from '../../../otterbots/utils/otterlogs';

const SIZE = POKE_SILHOUETTE_CONSTANTS.IMAGE_SIZE;
const PADDING = POKE_SILHOUETTE_CONSTANTS.IMAGE_PADDING;

// A silhouette needs an alpha channel. Below this share of transparent pixels the source
// is an opaque picture and would render as a plain black square.
const MIN_TRANSPARENT_RATIO = 0.05;

// Alpha values above this count as opaque, which tolerates the soft edges of an artwork.
const OPAQUE_ALPHA = 250;

export interface PokemonImages {
    silhouette: Buffer;
    reveal: Buffer;
}

interface FitBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * Contain-fit the sprite inside the padded square, keeping its aspect ratio.
 */
function fitBox(sprite: Image): FitBox {
    const available = SIZE - PADDING * 2;
    const scale = Math.min(available / sprite.width, available / sprite.height);
    const width = Math.round(sprite.width * scale);
    const height = Math.round(sprite.height * scale);

    return {
        x: Math.round((SIZE - width) / 2),
        y: Math.round((SIZE - height) / 2),
        width,
        height,
    };
}

/**
 * Tells whether enough of the drawn sprite is transparent to give a readable silhouette.
 * Only the sprite box is sampled: the padding around it is transparent by construction
 * and would otherwise hide an opaque source.
 */
function hasUsableAlpha(ctx: CanvasRenderingContext2D, box: FitBox): boolean {
    const { data } = ctx.getImageData(box.x, box.y, box.width, box.height);

    let sampled = 0;
    let transparent = 0;

    // Every fourth pixel is enough to measure a ratio, and keeps the scan cheap.
    for (let alpha = 3; alpha < data.length; alpha += 16) {
        sampled++;
        if (data[alpha] < OPAQUE_ALPHA) transparent++;
    }

    return sampled > 0 && transparent / sampled >= MIN_TRANSPARENT_RATIO;
}

/**
 * Draws on the shared background and returns the encoded PNG.
 */
function compose(draw: (ctx: CanvasRenderingContext2D) => void): Buffer {
    const canvas = createCanvas(SIZE, SIZE);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = POKE_SILHOUETTE_COLORS.BG;
    ctx.fillRect(0, 0, SIZE, SIZE);
    draw(ctx);

    return canvas.toBuffer();
}

/**
 * Génère la silhouette et l'artwork en couleur d'un Pokémon.
 * Le sprite n'est téléchargé qu'une fois, la révélation est donc immédiate.
 * Renvoie null si le sprite est introuvable ou inexploitable en silhouette.
 */
export async function renderPokemonImages(pokemon: PokemonData): Promise<PokemonImages | null> {
    if (!pokemon.artworkUrl) {
        otterlogs.warn(`poke-silhouette: aucun artwork pour ${pokemon.name}`);
        return null;
    }

    const sprite = await loadSprite(pokemon.artworkUrl);
    if (!sprite) {
        otterlogs.warn(`poke-silhouette: sprite introuvable pour ${pokemon.name}`);
        return null;
    }

    const box = fitBox(sprite);

    // The sprite is silhouetted on its own canvas: 'source-in' applied on the final
    // canvas would erase the background along with it.
    const mask = createCanvas(SIZE, SIZE);
    const maskCtx = mask.getContext('2d');
    maskCtx.drawImage(sprite, box.x, box.y, box.width, box.height);

    if (!hasUsableAlpha(maskCtx, box)) {
        otterlogs.warn(`poke-silhouette: ${pokemon.name} n'a pas de transparence exploitable`);
        return null;
    }

    maskCtx.globalCompositeOperation = 'source-in';
    maskCtx.fillStyle = POKE_SILHOUETTE_COLORS.SILHOUETTE;
    maskCtx.fillRect(0, 0, SIZE, SIZE);

    return {
        silhouette: compose(ctx => ctx.drawImage(mask, 0, 0)),
        reveal: compose(ctx => ctx.drawImage(sprite, box.x, box.y, box.width, box.height)),
    };
}
