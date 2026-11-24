import { readFileSync } from "node:fs";
import path from "node:path";

import { createMockDrizzleClient } from "#/db/clients/drizzle-client.mock";
import { EmailTable, EmailThreadTable } from "#/db/schemas";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { InboundEmailPayload } from "../inboundEmail.types";
import { resolveInboundThreadId } from "./resendInbound.handler";

const SCHEMA_SQL = readFileSync(
  path.resolve(process.cwd(), "full-schema.sql"),
  "utf8"
);

const database = createMockDrizzleClient();

const THREAD_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const THREAD_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function payload(headers: Record<string, string>): InboundEmailPayload {
  return {
    object: "email",
    id: "in-1",
    to: ["inbox@x.com"],
    from: "sender@x.com",
    created_at: "2026-11-25T00:00:00.000Z",
    subject: "Re: hello",
    bcc: null,
    cc: null,
    reply_to: null,
    received_for: ["inbox@x.com"],
    html: null,
    text: "hi",
    headers,
    message_id: "<child@x.com>",
    attachments: [],
  };
}

beforeAll(async () => {
  await database.$client.exec(SCHEMA_SQL);
});

beforeEach(async () => {
  await database.delete(EmailTable);
  await database.delete(EmailThreadTable);

  await database.insert(EmailThreadTable).values([
    { id: THREAD_A, subject: "hello", contactEmail: "sender@x.com" },
    { id: THREAD_B, subject: "hello", contactEmail: "sender@x.com" },
  ]);

  await database.insert(EmailTable).values([
    {
      id: "email-a",
      direction: "outbound",
      status: "sent",
      threadId: THREAD_A,
      resendMessageId: "root@x.com",
      createdAt: new Date("2026-11-01T00:00:00.000Z"),
    },
    {
      id: "email-b",
      direction: "outbound",
      status: "sent",
      threadId: THREAD_B,
      resendMessageId: "later@x.com",
      createdAt: new Date("2026-11-02T00:00:00.000Z"),
    },
  ]);
});

describe("resolveInboundThreadId", () => {
  it("matches on In-Reply-To", async () => {
    const threadId = await resolveInboundThreadId(
      database,
      payload({ "in-reply-to": "<later@x.com>" })
    );

    expect(threadId).toBe(THREAD_B);
  });

  it("strips angle brackets before matching", async () => {
    const threadId = await resolveInboundThreadId(
      database,
      payload({ "in-reply-to": "  <later@x.com>  " })
    );

    expect(threadId).toBe(THREAD_B);
  });

  it("falls back to References for the oldest known message", async () => {
    const threadId = await resolveInboundThreadId(
      database,
      payload({ references: "<unknown@x.com> <later@x.com> <root@x.com>" })
    );

    expect(threadId).toBe(THREAD_A);
  });

  it("returns undefined when nothing matches", async () => {
    expect(
      await resolveInboundThreadId(
        database,
        payload({ "in-reply-to": "<nope@x.com>" })
      )
    ).toBeUndefined();
  });

  it("returns undefined with no threading headers", async () => {
    expect(await resolveInboundThreadId(database, payload({}))).toBeUndefined();
  });

  it("returns undefined for a References header with no ids", async () => {
    expect(
      await resolveInboundThreadId(database, payload({ references: "   " }))
    ).toBeUndefined();
  });

  it("returns undefined when the parent email has no thread", async () => {
    await database.insert(EmailTable).values({
      id: "email-c",
      direction: "outbound",
      status: "sent",
      resendMessageId: "orphan@x.com",
    });

    expect(
      await resolveInboundThreadId(
        database,
        payload({ "in-reply-to": "<orphan@x.com>" })
      )
    ).toBeUndefined();
  });
});
