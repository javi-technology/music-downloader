/** Equivalente ao `slugify` (python-slugify) usado pelo spotDL. */
export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Similaridade Indel normalizada (mesma métrica do `rapidfuzz.fuzz.ratio`), 0–100. */
export function ratio(a: string, b: string): number {
  const total = a.length + b.length;
  if (total === 0) return 100;
  return ((2 * longestCommonSubsequence(a, b)) / total) * 100;
}

function longestCommonSubsequence(a: string, b: string): number {
  let previous = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const current = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      current[j] =
        a[i - 1] === b[j - 1]
          ? previous[j - 1] + 1
          : Math.max(previous[j], current[j - 1]);
    }
    previous = current;
  }
  return previous[b.length];
}
