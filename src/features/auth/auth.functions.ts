import { DEFAULT_AUTH_PATH, DEFAULT_UNAUTH_PATH } from "#/constants";
import type { PermissionType } from "#/db/seed/permission.seed";
import { db } from "#/lib/db.server";
import { authLog } from "#/lib/logger.server";
import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";

import { getAuth } from "./auth.server";
import { getUserRolesAndPermission } from "./getUserPermission";
import { hasPermission } from "./permission";
import { findUserSession, listUserSessions } from "./sessions";

export function requirePermissions(
  userPermissions: Array<PermissionType>,
  inputPermissions: Array<PermissionType>,
  userId?: string
) {
  const isAllowed = hasPermission(userPermissions, inputPermissions, {
    userId,
  });
  if (!isAllowed) {
    throw redirect({
      href: DEFAULT_AUTH_PATH,
      replace: true,
    });
  }
}

function createAuthHeaders() {
  const requestHeaders = getRequestHeaders();
  const headers = new Headers();

  const cookie = requestHeaders.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  const userAgent = requestHeaders.get("user-agent");
  if (userAgent) headers.set("user-agent", userAgent);

  return headers;
}

async function getSessionContext() {
  const authSession = await getAuth().api.getSession({
    headers: createAuthHeaders(),
  });

  if (!authSession) {
    return null;
  }

  const rolesPermissions = await getUserRolesAndPermission(
    authSession.user.id,
    db
  );

  return {
    user: authSession.user,
    session: authSession.session,
    roles: rolesPermissions.roles,
    permissions: rolesPermissions.permissions,
  };
}

export const requireSessions = createServerFn({ method: "GET" }).handler(
  async () => {
    try {
      return await getSessionContext();
    } catch (error) {
      authLog.error({ err: error }, "auth.session.resolve_failed");
      throw error;
    }
  }
);

export const getSessions = createServerFn({ method: "GET" }).handler(
  async () => {
    const context = await getSessionContext();

    if (!context) {
      throw redirect({ href: DEFAULT_UNAUTH_PATH, replace: true });
    }

    return listUserSessions(db, context.user.id, context.session.token);
  }
);

export const revokeUserSession = createServerFn({ method: "POST" })
  .validator(z.object({ sessionId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const context = await getSessionContext();

    if (!context) {
      throw redirect({ href: DEFAULT_UNAUTH_PATH, replace: true });
    }

    const session = await findUserSession(db, context.user.id, data.sessionId);

    if (!session) {
      throw new Error("Session not found");
    }

    await getAuth().api.revokeSession({
      body: { token: session.token },
      headers: createAuthHeaders(),
    });

    return { success: true };
  });
