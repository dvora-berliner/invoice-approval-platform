import { describe, expect, it, vi } from "vitest";
import { createLogger } from "../src/logger";

function captureStream(stream: NodeJS.WriteStream) {
  const chunks: string[] = [];
  vi.spyOn(stream, "write").mockImplementation((chunk: unknown) => {
    chunks.push(String(chunk));
    return true;
  });
  return chunks;
}

describe("createLogger", () => {
  it("writes info lines to stdout as JSON with service and correlationId", () => {
    const chunks = captureStream(process.stdout);
    const logger = createLogger("svc-a", "corr-1");

    logger.info("hello");

    expect(chunks).toHaveLength(1);
    const line = JSON.parse(chunks[0]);
    expect(line).toMatchObject({
      level: "info",
      service: "svc-a",
      correlationId: "corr-1",
      message: "hello",
    });
    expect(typeof line.timestamp).toBe("string");
    vi.restoreAllMocks();
  });

  it("merges meta fields into the log line", () => {
    const chunks = captureStream(process.stdout);
    const logger = createLogger("svc-a", "corr-1");

    logger.warn("careful", { attempt: 3 });

    const line = JSON.parse(chunks[0]);
    expect(line).toMatchObject({ level: "warn", message: "careful", attempt: 3 });
    vi.restoreAllMocks();
  });

  it("writes error lines to stderr", () => {
    const chunks = captureStream(process.stderr);
    const logger = createLogger("svc-a", "corr-1");

    logger.error("boom", { code: "E_BOOM" });

    const line = JSON.parse(chunks[0]);
    expect(line).toMatchObject({ level: "error", service: "svc-a", message: "boom", code: "E_BOOM" });
    vi.restoreAllMocks();
  });

  it("allows an undefined correlationId", () => {
    const chunks = captureStream(process.stdout);
    const logger = createLogger("svc-a");

    logger.info("no correlation yet");

    const line = JSON.parse(chunks[0]);
    expect(line.correlationId).toBeUndefined();
    vi.restoreAllMocks();
  });
});
