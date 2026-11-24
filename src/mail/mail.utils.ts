/**
 * Normalise a message id for storage and comparison.
 *
 * Providers may send ids with surrounding whitespace or RFC 5322 angle
 * brackets (`<id@host>`); both forms must resolve to the same value or
 * reply threading silently fails to match.
 */
export function cleanMessageId(messageId: string): string {
  return messageId.trim().replace(/^<|>$/g, "");
}
