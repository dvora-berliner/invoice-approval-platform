import { beforeAll, describe, expect, it, vi } from "vitest";

const { queryMock, poolCtor } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  poolCtor: vi.fn(),
}));

vi.mock("pg", () => ({
  Pool: vi.fn().mockImplementation(function PoolMock(this: unknown, config: unknown) {
    poolCtor(config);
    return { query: queryMock };
  }),
}));

describe("db (before initPool)", () => {
  it("throws when used before initPool()", async () => {
    vi.resetModules();
    const fresh = await import("../src/db");
    await expect(fresh.ensureSchema()).rejects.toThrow("db pool used before initPool()");
  });
});

describe("db (after initPool)", () => {
  let db: typeof import("../src/db");

  beforeAll(async () => {
    vi.resetModules();
    db = await import("../src/db");
  });

  it("constructs the Pool with default connection settings", () => {
    db.initPool("s3cret");
    expect(poolCtor).toHaveBeenCalledWith({
      host: "postgres",
      port: 5432,
      database: "audit",
      user: "approvalflow",
      password: "s3cret",
    });
  });

  it("honors POSTGRES_* environment overrides", async () => {
    vi.stubEnv("POSTGRES_HOST", "custom-host");
    vi.stubEnv("POSTGRES_PORT", "6543");
    vi.stubEnv("POSTGRES_DB", "custom-db");
    vi.stubEnv("POSTGRES_USER", "custom-user");
    vi.resetModules();
    const fresh = await import("../src/db");

    fresh.initPool("s3cret");

    expect(poolCtor).toHaveBeenCalledWith({
      host: "custom-host",
      port: 6543,
      database: "custom-db",
      user: "custom-user",
      password: "s3cret",
    });
    vi.unstubAllEnvs();
  });

  it("ensureSchema runs the DDL against the pool", async () => {
    db.initPool("s3cret");
    queryMock.mockResolvedValue({ rows: [] });

    await db.ensureSchema();

    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("CREATE TABLE IF NOT EXISTS decision_events"));
  });

  it("insertEvent returns the new row id", async () => {
    db.initPool("s3cret");
    queryMock.mockResolvedValue({ rows: [{ id: 42 }] });

    const id = await db.insertEvent("InvoiceSubmitted", "t1", "corr-1", { a: 1 }, "2026-01-01T00:00:00.000Z");

    expect(id).toBe(42);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO decision_events"), [
      "InvoiceSubmitted",
      "t1",
      "corr-1",
      JSON.stringify({ a: 1 }),
      "2026-01-01T00:00:00.000Z",
    ]);
  });

  it("insertEvent returns null on a redelivered (conflicting) event", async () => {
    db.initPool("s3cret");
    queryMock.mockResolvedValue({ rows: [] });

    const id = await db.insertEvent("InvoiceSubmitted", "t1", "corr-1", { a: 1 }, "2026-01-01T00:00:00.000Z");

    expect(id).toBeNull();
  });

  it("eventsForTrackingOrCorrelation returns matching rows", async () => {
    db.initPool("s3cret");
    const rows = [{ id: 1, event_type: "InvoiceSubmitted" }];
    queryMock.mockResolvedValue({ rows });

    await expect(db.eventsForTrackingOrCorrelation("t1")).resolves.toEqual(rows);
  });

  it("queryRows returns the raw rows for an arbitrary query", async () => {
    db.initPool("s3cret");
    const rows = [{ count: "3" }];
    queryMock.mockResolvedValue({ rows });

    await expect(db.queryRows("SELECT 1")).resolves.toEqual(rows);
  });
});
