import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/dapr", () => ({
  getOutboxQueueWithEtag: vi.fn(),
  saveOutboxQueueWithEtag: vi.fn(),
  publishEvent: vi.fn(),
}));

import { getOutboxQueueWithEtag, publishEvent, saveOutboxQueueWithEtag } from "../src/dapr";
import { drainOutboxOnce, startOutboxRelay } from "../src/outboxRelay";

const getOutboxQueueWithEtagMock = vi.mocked(getOutboxQueueWithEtag);
const saveOutboxQueueWithEtagMock = vi.mocked(saveOutboxQueueWithEtag);
const publishEventMock = vi.mocked(publishEvent);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("drainOutboxOnce", () => {
  it("does nothing when the queue is empty", async () => {
    getOutboxQueueWithEtagMock.mockResolvedValue({ value: [], etag: "etag-1" });

    await drainOutboxOnce();

    expect(publishEventMock).not.toHaveBeenCalled();
    expect(saveOutboxQueueWithEtagMock).not.toHaveBeenCalled();
  });

  it("publishes every entry and clears the queue on success", async () => {
    const entries = [
      { id: "e1", topic: "InvoiceSupplemented", payload: { trackingId: "t1" } },
      { id: "e2", topic: "InvoiceSupplemented", payload: { trackingId: "t2" } },
    ];
    getOutboxQueueWithEtagMock.mockResolvedValue({ value: entries, etag: "etag-1" });
    publishEventMock.mockResolvedValue(undefined);
    saveOutboxQueueWithEtagMock.mockResolvedValue(true);

    await drainOutboxOnce();

    expect(publishEventMock).toHaveBeenCalledWith("InvoiceSupplemented", { trackingId: "t1" });
    expect(publishEventMock).toHaveBeenCalledWith("InvoiceSupplemented", { trackingId: "t2" });
    expect(saveOutboxQueueWithEtagMock).toHaveBeenCalledWith([], "etag-1");
  });

  it("leaves a failed entry in the queue instead of dropping it", async () => {
    const entries = [
      { id: "e1", topic: "InvoiceSupplemented", payload: { trackingId: "t1" } },
      { id: "e2", topic: "InvoiceSupplemented", payload: { trackingId: "t2" } },
    ];
    getOutboxQueueWithEtagMock.mockResolvedValue({ value: entries, etag: "etag-1" });
    publishEventMock.mockImplementation(async (_topic, payload) => {
      if ((payload as { trackingId: string }).trackingId === "t2") {
        throw new Error("pubsub unreachable");
      }
    });
    saveOutboxQueueWithEtagMock.mockResolvedValue(true);

    await drainOutboxOnce();

    expect(saveOutboxQueueWithEtagMock).toHaveBeenCalledWith([entries[1]], "etag-1");
  });

  it("retries with a fresh read when the queue write conflicts", async () => {
    const entry = { id: "e1", topic: "InvoiceSupplemented", payload: { trackingId: "t1" } };
    getOutboxQueueWithEtagMock
      .mockResolvedValueOnce({ value: [entry], etag: "etag-1" })
      .mockResolvedValueOnce({ value: [entry], etag: "etag-2" });
    publishEventMock.mockResolvedValue(undefined);
    saveOutboxQueueWithEtagMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    await drainOutboxOnce();

    expect(getOutboxQueueWithEtagMock).toHaveBeenCalledTimes(2);
    expect(publishEventMock).toHaveBeenCalledTimes(2);
    expect(saveOutboxQueueWithEtagMock).toHaveBeenNthCalledWith(2, [], "etag-2");
  });
});

describe("startOutboxRelay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("polls on the configured interval and skips overlapping runs", async () => {
    let resolveFirstDrain: (() => void) | undefined;
    getOutboxQueueWithEtagMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFirstDrain = () => resolve({ value: [], etag: "etag-1" });
        }),
    );

    const timer = startOutboxRelay();
    try {
      await vi.advanceTimersByTimeAsync(2000);
      expect(getOutboxQueueWithEtagMock).toHaveBeenCalledTimes(1);

      // A second tick fires while the first drain is still in flight - it must be skipped.
      await vi.advanceTimersByTimeAsync(2000);
      expect(getOutboxQueueWithEtagMock).toHaveBeenCalledTimes(1);

      resolveFirstDrain?.();
      await Promise.resolve();
      await Promise.resolve();
    } finally {
      clearInterval(timer);
    }
  });
});
