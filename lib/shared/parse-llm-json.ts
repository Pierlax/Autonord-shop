/**
 * Shared utility for parsing JSON from LLM text responses.
 *
 * LLMs often wrap JSON in markdown fences or add preamble text.
 * This utility strips those wrappers and returns the first valid
 * JSON object found. Replaces ~15 inline copies of the same pattern.
 */

export class ParseLLMError extends Error {
  constructor(
    message: string,
    public readonly rawText: string
  ) {
    super(message);
    this.name = 'ParseLLMError';
  }
}

/**
 * Extract and parse the first JSON object from an LLM response.
 *
 * @param text - Raw LLM output (may contain markdown fences, preamble, etc.)
 * @returns Parsed object of type T
 * @throws ParseLLMError if no JSON object is found or JSON.parse fails
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

  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  } catch (e) {
    throw new ParseLLMError(
      `Failed to parse JSON from LLM response: ${e instanceof Error ? e.message : String(e)}`,
      text
    );
  }
}
