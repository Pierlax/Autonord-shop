/**
 * Shared utility for parsing JSON from LLM text responses.
 *
 * LLMs often wrap JSON in markdown fences or add preamble text.
 * This utility strips those wrappers, extracts the outermost JSON object,
 * and — if the first parse fails — attempts automatic repair of unescaped
 * double-quotes (common in Italian inch specs and measurement notation).
 *
 * C5 fix: centralises ~15 inline copies of the same pattern that were
 * scattered across two-phase-qa.ts and ai-enrichment-v3.ts.
 */

// =============================================================================
// ERROR
// =============================================================================

export class ParseLLMError extends Error {
  constructor(
    message: string,
    public readonly rawText: string
  ) {
    super(message);
    this.name = 'ParseLLMError';
  }
}

// =============================================================================
// REPAIR UTILITY
// =============================================================================

/**
 * Repairs JSON strings that contain unescaped double-quote characters inside
 * string values.  Gemini sometimes emits bare `"` for inch specs or Italian
 * quotation marks (e.g. `attacco 1/2"`) which breaks `JSON.parse()`.
 *
 * Strategy: scan character by character.  Inside a string value, any `"` NOT
 * followed by a JSON structural token (`:`, `,`, `]`, `}`, whitespace+structural)
 * is treated as an inline/measurement quote and replaced with `″` (U+2033).
 *
 * Exported so it can be tested independently and used standalone when needed.
 */
export function repairUnescapedQuotes(s: string): string {
  let result = '';
  let inString = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      result += c;
      escape = false;
      continue;
    }
    if (c === '\\' && inString) {
      result += c;
      escape = true;
      continue;
    }
    if (c === '"') {
      if (!inString) {
        inString = true;
        result += c;
      } else {
        // Inside a string: look ahead to decide if this is the closing quote.
        // Skip whitespace, then check next structural char.
        let j = i + 1;
        while (j < s.length && /\s/.test(s[j])) j++;
        const nextCh = j < s.length ? s[j] : '';
        if (nextCh === ':' || nextCh === ',' || nextCh === ']' || nextCh === '}' || nextCh === '"' || nextCh === '') {
          // Structural token follows — this is the closing quote
          inString = false;
          result += c;
        } else {
          // Non-structural character follows — inline quote, replace with ″
          result += '″';
        }
      }
    } else {
      result += c;
    }
  }
  return result;
}

// =============================================================================
// MAIN PARSER
// =============================================================================

/**
 * Extract and parse the first JSON object from an LLM response.
 *
 * 1. Strips markdown code fences (`\`\`\`json` / `\`\`\``)
 * 2. Finds the outermost `{ ... }` block
 * 3. Attempts `JSON.parse()`
 * 4. On failure, runs `repairUnescapedQuotes()` and retries once
 *
 * @param text - Raw LLM output (may contain markdown fences, preamble, etc.)
 * @returns Parsed object of type T
 * @throws ParseLLMError if no JSON object is found or both parse attempts fail
 *
 * @example
 * const data = parseJsonFromLLM<{ score: number }>(result.text);
 */
export function parseJsonFromLLM<T = unknown>(text: string): T {
  // Strip markdown code fences
  const cleaned = text
    .replace(/```json\s*/g, '')
    .replace(/```\s*/g, '')
    .trim();

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');

  if (start === -1 || end === -1) {
    throw new ParseLLMError('No JSON object found in LLM response', text);
  }

  const jsonStr = cleaned.slice(start, end + 1);

  // First attempt: standard JSON.parse
  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    // Second attempt: repair unescaped inline quotes (common with Gemini + Italian specs)
    const repaired = repairUnescapedQuotes(jsonStr);
    try {
      return JSON.parse(repaired) as T;
    } catch (e) {
      throw new ParseLLMError(
        `Failed to parse JSON from LLM response: ${e instanceof Error ? e.message : String(e)}`,
        text
      );
    }
  }
}
