/** Text for comparisons: no diacritics, lower case ("Łódź" → "lodz"). */
export function normalizeText(value: string): string {
  return value
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** Whether every word of the query occurs in one of the fields (word order does not matter). */
export function matchesQuery(query: string, ...fields: readonly string[]): boolean {
  const words = normalizeText(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalizeText(fields.join(' '));
  return words.every(w => haystack.includes(w));
}

export const shortId = (uuid: string) => uuid.slice(0, 8);

/** The title of a session until it gets a name (from Claude or Claude Code) */
export const defaultSessionTitle = (uuid: string) => `Session ${shortId(uuid)}`;
