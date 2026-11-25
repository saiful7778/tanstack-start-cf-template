/**
 * Minimal `cloudflare:workers` stand-in for Vitest, which runs outside workerd.
 * Only the pieces imported by application modules are provided.
 */
export abstract class DurableObject<TEnv = unknown, TProps = unknown> {
  protected ctx: DurableObjectState<TProps>;
  protected env: TEnv;

  constructor(ctx: DurableObjectState<TProps>, env: TEnv) {
    this.ctx = ctx;
    this.env = env;
  }
}

export abstract class WorkerEntrypoint<TEnv = unknown, TProps = unknown> {
  protected ctx: ExecutionContext<TProps>;
  protected env: TEnv;

  constructor(ctx: ExecutionContext<TProps>, env: TEnv) {
    this.ctx = ctx;
    this.env = env;
  }
}

export const env: Record<string, unknown> = {};
