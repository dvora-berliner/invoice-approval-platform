export function extractCorrelationId(eventPayload: unknown): string | undefined {
  if (
    eventPayload &&
    typeof eventPayload === "object" &&
    "correlationId" in eventPayload &&
    typeof (eventPayload as { correlationId: unknown }).correlationId === "string"
  ) {
    return (eventPayload as { correlationId: string }).correlationId;
  }
  return undefined;
}

export function withCorrelationHeader(
  correlationId: string,
  headers: Record<string, string> = {}
): Record<string, string> {
  return { ...headers, "x-correlation-id": correlationId };
}

export function attachCorrelationId<T extends object>(
  correlationId: string,
  payload: T
): T & { correlationId: string } {
  return { ...payload, correlationId };
}
