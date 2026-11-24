import { useState } from "react";

import { Badge } from "#/components/ui/badge";
import { ButtonSpinner } from "#/components/ui/button-spinner";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";
import { formatDateWithTimezone } from "#/utils/formatDate";
import { useAuthStore } from "#/zustand/auth/AuthStoreContext";
import { createClientOnlyFn } from "@tanstack/react-start";
import { Monitor, Smartphone, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { UAParser } from "ua-parser-js";

import { authClient } from "../auth.client";
import { revokeUserSession } from "../auth.functions";
import type { UserSessionView } from "../sessions";

export function SessionManagement({
  sessions,
}: {
  sessions: Array<UserSessionView>;
}) {
  const [isLoading, setIsLoading] = useState(false);

  const otherSessions = sessions.filter((session) => !session.isCurrent);
  const currentSession = sessions.find((session) => session.isCurrent);

  const revokeOtherSessions = createClientOnlyFn(() => {
    if (otherSessions.length === 0) return;
    const toastId = "revoke_other_sessions_toast_message";

    return authClient.revokeOtherSessions(undefined, {
      onRequest: () => {
        setIsLoading(true);
        toast.loading("Revoking other sessions...", { id: toastId });
      },
      onSuccess: () => {
        setIsLoading(false);
        toast.success("Other sessions revoked", { id: toastId });
      },
      onError: ({ error }) => {
        setIsLoading(false);
        toast.error(error.message || "Error revoking other sessions", {
          id: toastId,
        });
      },
    });
  });

  return (
    <div className="space-y-6">
      {currentSession && (
        <SessionCard
          session={currentSession}
          isCurrentSession
          isLoading={isLoading}
          setIsLoading={setIsLoading}
        />
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium">Other Active Sessions</h3>
          {otherSessions.length > 0 && (
            <ButtonSpinner
              isLoading={isLoading}
              variant="destructive"
              size="sm"
              onClick={revokeOtherSessions}
            >
              Revoke Other Sessions
            </ButtonSpinner>
          )}
        </div>

        {otherSessions.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No other active sessions
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {otherSessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                isLoading={isLoading}
                setIsLoading={setIsLoading}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SessionCard({
  session,
  isCurrentSession = false,
  isLoading,
  setIsLoading,
}: {
  session: UserSessionView;
  isCurrentSession?: boolean;
  isLoading: boolean;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const user = useAuthStore((state) => state.user);

  const userAgentInfo = session.userAgent ? UAParser(session.userAgent) : null;

  const getBrowserInformation = () => {
    if (userAgentInfo == null) return "Unknown Device";
    if (userAgentInfo.browser.name == null && userAgentInfo.os.name == null) {
      return "Unknown Device";
    }

    if (userAgentInfo.browser.name == null) return userAgentInfo.os.name;
    if (userAgentInfo.os.name == null) return userAgentInfo.browser.name;

    return `${userAgentInfo.browser.name}, ${userAgentInfo.os.name}`;
  };

  const revokeSession = createClientOnlyFn(async () => {
    const toastId = `revoke_session_${session.id}_toast_message`;

    setIsLoading(true);
    toast.loading("Revoking session...", { id: toastId });

    try {
      await revokeUserSession({ data: { sessionId: session.id } });
      toast.success("Session revoked", { id: toastId });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error revoking session",
        { id: toastId }
      );
    } finally {
      setIsLoading(false);
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{getBrowserInformation()}</CardTitle>
        {isCurrentSession && (
          <CardAction>
            <Badge>Current Session</Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {userAgentInfo?.device.type === "mobile" ? (
              <Smartphone />
            ) : (
              <Monitor />
            )}
            <div>
              <p className="text-sm text-muted-foreground">
                Created:{" "}
                {formatDateWithTimezone(
                  new Date(session.createdAt),
                  "dd/MM/yyyy HH:mm:ss aa",
                  user.timezone
                )}
              </p>
              <p className="text-sm text-muted-foreground">
                Expires:{" "}
                {formatDateWithTimezone(
                  new Date(session.expiresAt),
                  "dd/MM/yyyy HH:mm:ss aa",
                  user.timezone
                )}
              </p>
            </div>
          </div>
          {!isCurrentSession && (
            <ButtonSpinner
              isLoading={isLoading}
              variant="destructive"
              size="icon-sm"
              onClick={revokeSession}
            >
              <Trash2 />
            </ButtonSpinner>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
