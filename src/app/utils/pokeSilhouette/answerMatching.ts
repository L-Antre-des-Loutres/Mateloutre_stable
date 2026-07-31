import { PokemonData } from "../pokedle/gameLogic";

// Combining diacritical marks, left over once the name is decomposed with NFD.
const DIACRITICS = /[̀-ͯ]/g;

/**
 * Normalizes a Pokémon name for comparison: lowercase, no accents, letters and digits only.
 * Gender symbols are mapped first, otherwise Nidoran♀ and Nidoran♂ would collapse onto the same key.
 */
export function normalizeName(input: string): string {
    return input
        .toLowerCase()
        .replace(/♀/g, "f")
        .replace(/♂/g, "m")
        .normalize("NFD")
        .replace(DIACRITICS, "")
        .replace(/[^a-z0-9]/g, "");
}

/**
 * Indexes a Pokémon list by normalized name, to tell a real guess from ordinary chat.
 */
export function buildNameIndex(list: PokemonData[]): Map<string, PokemonData> {
    const index = new Map<string, PokemonData>();
    for (const pokemon of list) {
        const key = normalizeName(pokemon.name);
        if (key && !index.has(key)) {
            index.set(key, pokemon);
        }
    }
    return index;
}
