import type { DatabaseType } from "#/db/clients/drizzle-client";
import { SessionTable } from "#/db/schemas";
import { and, eq } from "drizzle-orm";

export interface UserSessionView {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  expiresAt: Date;
  isCurrent: boolean;
}

export async function listUserSessions(
  database: DatabaseType,
  userId: string,
  currentToken: string
): Promise<Array<UserSessionView>> {
  const sessions = await database
    .select({
      id: SessionTable.id,
      token: SessionTable.token,
      ipAddress: SessionTable.ipAddress,
      userAgent: SessionTable.userAgent,
      createdAt: SessionTable.createdAt,
      expiresAt: SessionTable.expiresAt,
    })
    .from(SessionTable)
    .where(eq(SessionTable.userId, userId));

  return sessions.map(({ token, ...session }) => ({
    ...session,
    isCurrent: token === currentToken,
  }));
}

export async function findUserSession(
  database: DatabaseType,
  userId: string,
  sessionId: string
) {
  const [session] = await database
    .select({
      id: SessionTable.id,
      token: SessionTable.token,
    })
    .from(SessionTable)
    .where(and(eq(SessionTable.id, sessionId), eq(SessionTable.userId, userId)))
    .limit(1);

  return session;
}
