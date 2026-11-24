import type { SendMailOption } from "./mailTransport.types";

/**
 * Turn the local threading fields into standard `In-Reply-To`/`References`
 * headers, merged with any headers the caller already set.
 */
export function buildThreadHeaders(
  options: Pick<SendMailOption, "headers" | "inReplyTo" | "references">
): Record<string, string> | undefined {
  const headers: Record<string, string> = { ...options.headers };

  if (options.inReplyTo) headers["In-Reply-To"] = options.inReplyTo;

  if (options.references?.length) {
    headers.References = options.references.join(" ");
  }

  return Object.keys(headers).length > 0 ? headers : undefined;
}
