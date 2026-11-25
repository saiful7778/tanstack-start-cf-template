import { API_MESSAGES } from "#/constants/apiMessage";
import { ApiResponseJson } from "#/helpers/ApiResponseJson";
import { db } from "#/lib/db.server";
import { rpcHandler } from "#/oRPC/orpc.handler";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/rpc/$")({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        const { response } = await rpcHandler.handle(request, {
          prefix: "/api/rpc",
          context: {
            reqHeaders: request.headers,
            db,
            user: null,
            session: null,
            roles: [],
            permissions: [],
          },
        });

        return (
          response ??
          ApiResponseJson(false, API_MESSAGES.GENERAL.NOT_FOUND, null, 404)
        );
      },
    },
  },
});
