type LogMeta = Record<string, unknown>;

export interface Logger {
  info(message: string, meta?: LogMeta): void;
  warn(message: string, meta?: LogMeta): void;
  error(message: string, meta?: LogMeta): void;
}

function write(
  stream: NodeJS.WriteStream,
  level: "info" | "warn" | "error",
  service: string,
  correlationId: string | undefined,
  message: string,
  meta?: LogMeta
): void {
  const line = {
    level,
    service,
    correlationId,
    timestamp: new Date().toISOString(),
    message,
    ...meta,
  };
  stream.write(`${JSON.stringify(line)}\n`);
}

export function createLogger(service: string, correlationId?: string): Logger {
  return {
    info: (message, meta) => write(process.stdout, "info", service, correlationId, message, meta),
    warn: (message, meta) => write(process.stdout, "warn", service, correlationId, message, meta),
    error: (message, meta) => write(process.stderr, "error", service, correlationId, message, meta),
  };
}
