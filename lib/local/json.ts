/**
 * Small models routinely wrap JSON in prose or code fences, use trailing commas, or run out of
 * tokens mid-object. These helpers recover as much structure as possible so one sloppy generation
 * doesn't cost a whole analysis pass.
 */

interface ScanResult {
  /** Index of the closing brace when the object is complete. */
  end: number | null;
  /** For truncated input: the closers needed at the end, and whether a string is still open. */
  closers: string;
  inString: boolean;
  /** Candidate truncation points (just before a comma), with the closers valid at that point. */
  cuts: { position: number; closers: string }[];
}

function scan(source: string, start: number): ScanResult {
  const stack: string[] = [];
  const cuts: ScanResult['cuts'] = [];
  let inString = false;
  let escaped = false;

  for (let i = start; i < source.length; i++) {
    const char = source[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') inString = true;
    else if (char === '{') stack.push('}');
    else if (char === '[') stack.push(']');
    else if (char === '}' || char === ']') {
      stack.pop();
      if (stack.length === 0) return { end: i, closers: '', inString: false, cuts };
    } else if (char === ',') {
      cuts.push({ position: i, closers: [...stack].reverse().join('') });
    }
  }

  return { end: null, closers: [...stack].reverse().join(''), inString, cuts };
}

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // Tolerate trailing commas, the most common small-model slip.
    try {
      return JSON.parse(text.replace(/,\s*([}\]])/g, '$1'));
    } catch {
      return undefined;
    }
  }
}

/** Returns the first JSON object found in `text`, repairing truncated output when possible. */
export function extractJsonObject(text: string): Record<string, unknown> | null {
  const stripped = text.replace(/```(?:json)?/gi, '');
  const start = stripped.indexOf('{');
  if (start === -1) return null;

  const result = scan(stripped, start);
  const asObject = (value: unknown): Record<string, unknown> | null =>
    value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

  if (result.end !== null) return asObject(tryParse(stripped.slice(start, result.end + 1)));

  // Truncated: close what is open, then fall back to cutting at earlier commas until it parses.
  const tail = stripped.slice(start).replace(/[,:\s]+$/, '');
  const closed = tryParse(`${tail}${result.inString ? '"' : ''}${result.closers}`);
  if (asObject(closed)) return asObject(closed);

  for (let i = result.cuts.length - 1; i >= 0; i--) {
    const cut = result.cuts[i];
    const repaired = tryParse(`${stripped.slice(start, cut.position)}${cut.closers}`);
    if (asObject(repaired)) return asObject(repaired);
  }
  return null;
}
