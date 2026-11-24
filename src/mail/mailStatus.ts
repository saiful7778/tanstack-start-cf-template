import type { EmailStatusEnumType } from "#/db/schemas/enums/zod-db-enums";

/**
 * Ordering of email statuses for out-of-order webhook delivery.
 *
 * Resend retries and concurrent providers deliver events in no particular
 * order, so a late `email.sent` must not drag a `delivered` mail backwards.
 * A transition is applied only when it targets a strictly higher rank; the
 * provider-reported outcome for a given delivery is then recorded once and
 * never regressed.
 *
 * Outbound only. Inbound mail is `received` from the moment it is stored.
 */
export const EMAIL_STATUS_RANK: Record<EmailStatusEnumType, number> = {
  draft: 0,
  queued: 1,
  sent: 2,
  delivery_delayed: 3,
  delivered: 4,
  received: 4,
  bounced: 5,
  complained: 5,
  suppressed: 5,
  failed: 5,
};

/** Statuses at or beyond `status`, i.e. the ones it must not overwrite. */
export function statusesAtOrAbove(
  status: EmailStatusEnumType
): EmailStatusEnumType[] {
  const rank = EMAIL_STATUS_RANK[status];

  return (Object.keys(EMAIL_STATUS_RANK) as EmailStatusEnumType[]).filter(
    (candidate) => EMAIL_STATUS_RANK[candidate] >= rank
  );
}

export function isStatusAdvance(
  from: EmailStatusEnumType,
  to: EmailStatusEnumType
): boolean {
  return EMAIL_STATUS_RANK[to] > EMAIL_STATUS_RANK[from];
}
