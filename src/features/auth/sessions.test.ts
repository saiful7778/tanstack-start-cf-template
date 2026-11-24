import { readFileSync } from "node:fs";
import path from "node:path";

import { createMockDrizzleClient } from "#/db/clients/drizzle-client.mock";
import { SessionTable, UserTable } from "#/db/schemas";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { findUserSession, listUserSessions } from "./sessions";

const SCHEMA_SQL = readFileSync(
  path.resolve(process.cwd(), "full-schema.sql"),
  "utf8"
);

const database = createMockDrizzleClient();

const CREATED_AT = new Date("2026-01-01T00:00:00.000Z");
const EXPIRES_AT = new Date("2026-02-01T00:00:00.000Z");

beforeAll(async () => {
  await database.$client.exec(SCHEMA_SQL);
});

beforeEach(async () => {
  await database.delete(SessionTable);
  await database.delete(UserTable);

  await database.insert(UserTable).values([
    {
      id: "user-a",
      name: "User A",
      email: "a@example.com",
      role: "USER",
    },
    {
      id: "user-b",
      name: "User B",
      email: "b@example.com",
      role: "USER",
    },
  ]);

  await database.insert(SessionTable).values([
    {
      id: "session-current",
      token: "token-current",
      userId: "user-a",
      ipAddress: "1.1.1.1",
      userAgent: "Chrome",
      createdAt: CREATED_AT,
      expiresAt: EXPIRES_AT,
    },
    {
      id: "session-other-a",
      token: "token-other-a",
      userId: "user-a",
      ipAddress: "2.2.2.2",
      userAgent: "Safari",
      createdAt: CREATED_AT,
      expiresAt: EXPIRES_AT,
    },
    {
      id: "session-b",
      token: "token-b",
      userId: "user-b",
      ipAddress: "3.3.3.3",
      userAgent: "Firefox",
      createdAt: CREATED_AT,
      expiresAt: EXPIRES_AT,
    },
  ]);
});

describe("listUserSessions", () => {
  it("returns only the requested user's sessions without tokens", async () => {
    const sessions = await listUserSessions(
      database,
      "user-a",
      "token-current"
    );

    expect(sessions.map((session) => session.id)).toEqual([
      "session-current",
      "session-other-a",
    ]);
    expect(sessions.map((session) => session.isCurrent)).toEqual([true, false]);
    expect(sessions[0]).toMatchObject({
      id: "session-current",
      ipAddress: "1.1.1.1",
      userAgent: "Chrome",
    });
    expect(JSON.stringify(sessions)).not.toContain("token");
  });
});

describe("findUserSession", () => {
  it("finds a session only when it belongs to the user", async () => {
    await expect(
      findUserSession(database, "user-a", "session-current")
    ).resolves.toMatchObject({
      id: "session-current",
      token: "token-current",
    });

    await expect(
      findUserSession(database, "user-a", "session-b")
    ).resolves.toBeUndefined();
  });
});
