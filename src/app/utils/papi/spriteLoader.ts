import axios from 'axios';
import { Image, loadImage } from 'canvas';

/**
 * Resolves a sprite URL. Papi serves relative paths, external fallbacks are absolute.
 */
export function resolveSpriteUrl(url: string): string {
    const papiUrl = process.env.PAPI_URL || 'http://localhost:8080';
    return url.startsWith('/') ? `${papiUrl}${url}` : url;
}

/**
 * Charge un sprite Pokémon depuis une URL. Renvoie null si le chargement échoue.
 */
export async function loadSprite(url: string): Promise<Image | null> {
    try {
        const response = await axios.get(resolveSpriteUrl(url), {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            }
        });
        return await loadImage(Buffer.from(response.data));
    } catch {
        return null;
    }
}
