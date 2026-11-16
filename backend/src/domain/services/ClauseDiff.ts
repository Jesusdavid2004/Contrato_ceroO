/**
 * Diff determinista de texto y alineacion de clausulas. Sin IA: Jaccard
 * sobre tokens para alinear, LCS sobre palabras para el detalle. Clasifica
 * anadidos, eliminaciones y modificaciones; nunca equivalencia juridica.
 */

export interface DiffSegment {
  type: 'same' | 'add' | 'del';
  text: string;
}

export interface AlignedPair {
  baseIndex: number;
  otherIndex: number;
  similarity: number;
}

export interface ClauseComparisonInput {
  id: string;
  orderIndex: number;
  text: string;
}

export interface ClauseDiffResult {
  added: ClauseComparisonInput[];
  removed: ClauseComparisonInput[];
  modified: Array<{
    base: ClauseComparisonInput;
    other: ClauseComparisonInput;
    similarity: number;
    textDiff: DiffSegment[];
  }>;
  unchanged: number;
  truncated: boolean;
}

const SIMILARITY_THRESHOLD = 0.5;
const MAX_WORDS_PER_PAIR = 5000;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-záéíóúñü0-9]+/i)
    .filter((token) => token.length > 0);
}

export function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));
  if (setA.size === 0 && setB.size === 0) return 1;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

function words(text: string): string[] {
  return text.split(/(\s+)/).filter((part) => part.length > 0);
}

/** LCS sobre palabras; trunca con bandera honesta si excede el maximo. */
export function wordDiff(base: string, other: string): { segments: DiffSegment[]; truncated: boolean } {
  const a = words(base);
  const b = words(other);
  if (a.length + b.length > MAX_WORDS_PER_PAIR) {
    return { segments: [], truncated: true };
  }
  const previous = new Array<number>(b.length + 1).fill(0);
  const current = new Array<number>(b.length + 1).fill(0);
  const lengths: number[][] = [];
  for (let i = 0; i <= a.length; i += 1) {
    lengths.push(i === 0 ? [...previous] : [...current]);
    if (i === a.length) break;
    for (let j = 0; j < b.length; j += 1) {
      current[j + 1] = a[i] === b[j] ? previous[j] + 1 : Math.max(previous[j + 1], current[j]);
    }
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j];
  }
  const segments: DiffSegment[] = [];
  let i = a.length;
  let j = b.length;
  const raw: DiffSegment[] = [];
  const push = (type: DiffSegment['type'], text: string): void => {
    raw.push({ type, text });
  };
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      push('same', a[i - 1]);
      i -= 1;
      j -= 1;
    } else if (j > 0 && (i === 0 || (lengths[i][j - 1] ?? 0) >= (lengths[i - 1]?.[j] ?? 0))) {
      push('add', b[j - 1]);
      j -= 1;
    } else if (i > 0) {
      push('del', a[i - 1]);
      i -= 1;
    } else {
      break;
    }
  }
  raw.reverse();
  for (const segment of raw) {
    const last = segments[segments.length - 1];
    if (last && last.type === segment.type) last.text += segment.text;
    else segments.push({ type: segment.type, text: segment.text });
  }
  return { segments, truncated: false };
}

/**
 * Alinea por similitud maxima (greedy, determinista por orden) y clasifica.
 * Umbral 0.5 documentado: debajo son clausulas distintas (anadida/eliminada).
 */
export function compareClauses(
  base: ClauseComparisonInput[],
  other: ClauseComparisonInput[],
): ClauseDiffResult {
  const matchedOther = new Set<number>();
  const pairs: AlignedPair[] = [];
  const sortedBase = [...base].sort((x, y) => x.orderIndex - y.orderIndex);

  for (const baseClause of sortedBase) {
    let best: { index: number; similarity: number } | null = null;
    for (let index = 0; index < other.length; index += 1) {
      if (matchedOther.has(index)) continue;
      const similarity = jaccardSimilarity(baseClause.text, other[index].text);
      if (similarity >= SIMILARITY_THRESHOLD && (!best || similarity > best.similarity)) {
        best = { index, similarity };
      }
    }
    if (best) {
      matchedOther.add(best.index);
      const baseIndex = base.indexOf(baseClause);
      pairs.push({ baseIndex, otherIndex: best.index, similarity: best.similarity });
    }
  }

  const matchedBase = new Set(pairs.map((pair) => pair.baseIndex));
  const added = other.filter((_, index) => !matchedOther.has(index));
  const removed = base.filter((_, index) => !matchedBase.has(index));
  const modified: ClauseDiffResult['modified'] = [];
  let unchanged = 0;
  let truncated = false;
  for (const pair of pairs) {
    const baseClause = base[pair.baseIndex];
    const otherClause = other[pair.otherIndex];
    if (pair.similarity >= 1) {
      unchanged += 1;
      continue;
    }
    const { segments, truncated: pairTruncated } = wordDiff(baseClause.text, otherClause.text);
    truncated = truncated || pairTruncated;
    modified.push({ base: baseClause, other: otherClause, similarity: pair.similarity, textDiff: segments });
  }
  return { added, removed, modified, unchanged, truncated };
}
