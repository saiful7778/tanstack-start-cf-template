import { vi } from "vitest";

import type { LoggerType } from "./logger";

export function getLoggerMock() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as LoggerType;
}
