import { SmartCoercionPlugin } from "@orpc/json-schema";
import { RPCHandler } from "@orpc/server/fetch";
import {
  CORSPlugin,
  SimpleCsrfProtectionHandlerPlugin,
} from "@orpc/server/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";

import { router } from "./orpc.router";

export const rpcHandler = new RPCHandler(router, {
  plugins: [
    new CORSPlugin(),
    new SimpleCsrfProtectionHandlerPlugin(),
    new SmartCoercionPlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    }),
  ],
});
