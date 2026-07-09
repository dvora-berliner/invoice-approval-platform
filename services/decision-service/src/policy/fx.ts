export type FxRates = Record<string, number>;

// Matches sample-invoices.json's fxRates. Fallback when Dapr Configuration is unreachable.
export const FALLBACK_FX_RATES: FxRates = {
  USD: 1,
  EUR: 1.08,
  GBP: 1.27,
};

// GLOBAL-FX: any FX item over this USD amount is a hard stop regardless of the ceiling.
export const FX_HARDSTOP_USD = 1000;

export function convertToUsd(amount: number, currency: string | undefined, rates: FxRates): number {
  const code = (currency ?? "USD").toUpperCase();
  const rate = rates[code];
  if (rate === undefined) {
    throw new Error(`Unknown currency: ${code}`);
  }
  return Math.round(amount * rate * 100) / 100;
}

export function isForeignCurrency(currency: string | undefined): boolean {
  return (currency ?? "USD").toUpperCase() !== "USD";
}
