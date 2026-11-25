import { readFileSync } from "node:fs";
import path from "node:path";

import { createMockDrizzleClient } from "#/db/clients/drizzle-client.mock";
import {
  NotificationTable,
  RoleTable,
  UserRoleTable,
  UserTable,
} from "#/db/schemas";
import { router } from "#/oRPC/orpc.router";
import type { ORPCContext } from "#/types/orpc.types";
import { createRouterClient } from "@orpc/server";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("worker-mailer", () => ({
  WorkerMailer: { connect: vi.fn() },
}));

// Banning goes through Better Auth, which would need a real session cookie.
const banUser = vi.hoisted(() => vi.fn(async () => ({ status: true })));
const unbanUser = vi.hoisted(() => vi.fn(async () => ({ status: true })));

vi.mock("#/features/auth/auth.server", async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...(actual as object),
    getAuth: () => ({ api: { banUser, unbanUser } }),
  };
});

const SCHEMA_SQL = readFileSync(
  path.resolve(process.cwd(), "full-schema.sql"),
  "utf8"
);

const database = createMockDrizzleClient();

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_ID = "22222222-2222-4222-8222-222222222222";
const SUPER_ADMIN_ROLE_ID = "33333333-3333-4333-8333-333333333333";
const USER_ROLE_ID = "44444444-4444-4444-8444-444444444444";

async function seed() {
  await database.insert(UserTable).values([
    {
      id: ADMIN_ID,
      name: "Admin",
      email: "admin@example.com",
      role: "ADMIN",
      emailVerified: true,
    },
    {
      id: TARGET_ID,
      name: "Target",
      email: "target@example.com",
      role: "USER",
      emailVerified: true,
    },
  ]);

  await database.insert(RoleTable).values([
    { id: SUPER_ADMIN_ROLE_ID, roleName: "SUPER_ADMIN" },
    { id: USER_ROLE_ID, roleName: "USER" },
  ]);
}

/** Admin context with the permission the procedures require. */
function createClient() {
  return createRouterClient(router, {
    context: (): ORPCContext => ({
      reqHeaders: new Headers(),
      db: database,
      user: {
        id: ADMIN_ID,
        name: "Admin",
        email: "admin@example.com",
      } as never,
      session: { id: "session-1" } as never,
      roles: [{ roleName: "ADMIN" }],
      permissions: [
        { level: "system", resource: "user", action: "manage" },
        { level: "system", resource: "user", action: "update" },
      ],
    }),
  });
}

const client = createClient();

async function notificationsFor(recipientId: string) {
  return await database
    .select()
    .from(NotificationTable)
    .where(eq(NotificationTable.recipientId, recipientId));
}

beforeAll(async () => {
  await database.$client.exec(SCHEMA_SQL);
});

beforeEach(async () => {
  vi.clearAllMocks();
  await database.delete(NotificationTable);
  await database.delete(UserRoleTable);
  await database.delete(RoleTable);
  await database.delete(UserTable);
  await seed();
});

describe("userBanProcedure notifications", () => {
  it("notifies the banned user with the reason", async () => {
    const result = await client.user.ban({
      userId: TARGET_ID,
      banned: true,
      banReason: "Spamming",
    });

    expect(result.success).toBe(true);

    const rows = await notificationsFor(TARGET_ID);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      category: "SYSTEM",
      level: "WARNING",
      actorId: ADMIN_ID,
      title: "Your account has been banned",
      message: "Your account has been banned. Reason: Spamming",
    });
    expect(rows[0]!.data).toEqual({ reason: "Spamming", expiresAt: null });
  });

  it("notifies without a reason when none is given", async () => {
    await client.user.ban({ userId: TARGET_ID, banned: true });

    const [row] = await notificationsFor(TARGET_ID);

    expect(row).toMatchObject({
      message: "Your account has been banned.",
      level: "WARNING",
    });
  });

  it("records the ban expiry", async () => {
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await client.user.ban({
      userId: TARGET_ID,
      banned: true,
      banReason: "Cooling off",
      banExpires: expires,
    });

    const [row] = await notificationsFor(TARGET_ID);

    expect(row!.data).toMatchObject({
      expiresAt: expires.toISOString(),
    });
  });

  it("notifies with a success level on unban", async () => {
    await client.user.ban({ userId: TARGET_ID, banned: false });

    const [row] = await notificationsFor(TARGET_ID);

    expect(row).toMatchObject({
      level: "SUCCESS",
      title: "Your account has been restored",
      message: "Your account has been unbanned and access has been restored.",
    });
  });
});

describe("updateUserRoleProcedure notifications", () => {
  it("notifies the user about their new role", async () => {
    const result = await client.user.updateRole({
      userId: TARGET_ID,
      roleName: "SUPER_ADMIN",
    });

    expect(result.success).toBe(true);

    const rows = await notificationsFor(TARGET_ID);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      category: "SYSTEM",
      actorId: ADMIN_ID,
      title: "Your role has changed",
      message: "Your account role was changed to SUPER_ADMIN.",
    });
    expect(rows[0]!.data).toEqual({ roleName: "SUPER_ADMIN" });
  });

  it("raises the level for a privileged role", async () => {
    await client.user.updateRole({
      userId: TARGET_ID,
      roleName: "SUPER_ADMIN",
    });

    const [promoted] = await notificationsFor(TARGET_ID);

    expect(promoted).toMatchObject({ level: "WARNING" });
  });

  it("uses an info level for an ordinary role", async () => {
    await client.user.updateRole({ userId: TARGET_ID, roleName: "USER" });

    const [row] = await notificationsFor(TARGET_ID);

    expect(row).toMatchObject({ level: "INFO" });
  });

  it("does not notify when the role does not exist", async () => {
    await database.delete(RoleTable).where(eq(RoleTable.roleName, "USER"));

    await expect(
      client.user.updateRole({ userId: TARGET_ID, roleName: "USER" })
    ).rejects.toThrow();

    expect(await notificationsFor(TARGET_ID)).toHaveLength(0);
  });

  it("does not notify when the user does not exist", async () => {
    await expect(
      client.user.updateRole({
        userId: "99999999-9999-4999-8999-999999999999",
        roleName: "USER",
      })
    ).rejects.toThrow();

    expect(await notificationsFor(TARGET_ID)).toHaveLength(0);
  });

  it("still returns success when notification storage fails", async () => {
    // Break the notifications table so the insert fails *after* the ban has
    // been applied. The admin action must still succeed: the notification is a
    // courtesy, not part of the transaction.
    //
    // Kept last in this file: dropping a table cannot be undone by replaying
    // the schema, so nothing may run after this.
    await database.$client.exec("DROP TABLE notifications");

    const result = await client.user.ban({
      userId: TARGET_ID,
      banned: true,
      banReason: "Spam",
    });

    expect(result.success).toBe(true);
    expect(banUser).toHaveBeenCalledTimes(1);
  });
});
