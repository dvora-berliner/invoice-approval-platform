import { Pool, type QueryResultRow } from "pg";

let pool: Pool | undefined;

export function initPool(password: string): void {
  pool = new Pool({
    host: process.env.POSTGRES_HOST ?? "postgres",
    port: process.env.POSTGRES_PORT ? Number(process.env.POSTGRES_PORT) : 5432,
    database: process.env.POSTGRES_DB ?? "audit",
    user: process.env.POSTGRES_USER ?? "approvalflow",
    password,
  });
}

function getPool(): Pool {
  if (!pool) throw new Error("db pool used before initPool()");
  return pool;
}

export async function ensureSchema(): Promise<void> {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS decision_events (
      id             BIGSERIAL PRIMARY KEY,
      event_type     TEXT NOT NULL,
      tracking_id    TEXT NOT NULL,
      correlation_id TEXT NOT NULL,
      payload        JSONB NOT NULL,
      occurred_at    TIMESTAMPTZ NOT NULL,
      received_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS decision_events_dedup
      ON decision_events(event_type, tracking_id, occurred_at);
    CREATE INDEX IF NOT EXISTS decision_events_correlation ON decision_events(correlation_id);
    CREATE INDEX IF NOT EXISTS decision_events_tracking ON decision_events(tracking_id);

    CREATE OR REPLACE FUNCTION decision_events_block_mutation() RETURNS trigger AS $trigger$
    BEGIN
      RAISE EXCEPTION 'decision_events is append-only: % is not allowed', TG_OP;
    END;
    $trigger$ LANGUAGE plpgsql;

    CREATE OR REPLACE TRIGGER decision_events_immutable
      BEFORE UPDATE OR DELETE ON decision_events
      FOR EACH ROW EXECUTE FUNCTION decision_events_block_mutation();
  `);
}

export interface DecisionEventRow {
  id: number;
  event_type: string;
  tracking_id: string;
  correlation_id: string;
  payload: Record<string, unknown>;
  occurred_at: string;
  received_at: string;
}

// Returns the inserted row's id, or null if this exact event was already recorded
// (redelivery) - the caller just logs and moves on (M10: exactly one effect).
export async function insertEvent(
  eventType: string,
  trackingId: string,
  correlationId: string,
  payload: unknown,
  occurredAt: string
): Promise<number | null> {
  const result = await getPool().query<{ id: number }>(
    `INSERT INTO decision_events (event_type, tracking_id, correlation_id, payload, occurred_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (event_type, tracking_id, occurred_at) DO NOTHING
     RETURNING id`,
    [eventType, trackingId, correlationId, JSON.stringify(payload), occurredAt]
  );
  return result.rows[0]?.id ?? null;
}

export async function eventsForTrackingOrCorrelation(id: string): Promise<DecisionEventRow[]> {
  // Cast the TIMESTAMPTZ columns to text - `pg` otherwise returns native Date objects
  // for them, which silently violates DecisionEventRow's `string` typing (this is the
  // same type-lie that crashed GET /dashboard; cast here so it can't happen again).
  const result = await getPool().query<DecisionEventRow>(
    `SELECT id, event_type, tracking_id, correlation_id, payload, occurred_at::text, received_at::text
     FROM decision_events WHERE tracking_id = $1 OR correlation_id = $1 ORDER BY occurred_at ASC`,
    [id]
  );
  return result.rows;
}

export async function queryRows<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  const result = await getPool().query<T>(sql, params);
  return result.rows;
}
