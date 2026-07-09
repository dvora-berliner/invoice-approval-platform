import { DEFAULT_THRESHOLDS, type AutonomyThresholds } from "./thresholds";
import { FALLBACK_FX_RATES, type FxRates } from "./fx";

const DAPR_HTTP_PORT = process.env.DAPR_HTTP_PORT ?? "3500";
const CONFIG_STORE = "policy-configuration";

interface DaprConfigItem {
  value: string;
  version?: string;
}

// Fetched fresh on every call (not cached) so a threshold change in Redis takes effect on the
// next request with no redeploy. Falls back to DEFAULT_THRESHOLDS if the store is unreachable.
export async function loadThresholds(): Promise<AutonomyThresholds> {
  try {
    const res = await fetch(
      `http://localhost:${DAPR_HTTP_PORT}/v1.0/configuration/${CONFIG_STORE}?key=AUTONOMY-CEILING&key=AUTONOMY-CONFIDENCE`
    );
    if (!res.ok) {
      throw new Error(`Dapr configuration fetch failed: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as Record<string, DaprConfigItem>;
    const ceiling = Number(body["AUTONOMY-CEILING"]?.value);
    const confidence = Number(body["AUTONOMY-CONFIDENCE"]?.value);

    if (!Number.isFinite(ceiling) || !Number.isFinite(confidence)) {
      throw new Error(`Dapr configuration returned invalid threshold values: ${JSON.stringify(body)}`);
    }
    return { ceiling, confidence };
  } catch (err) {
    console.error("decision-service: failed to load thresholds from Dapr Configuration, using defaults", err);
    return DEFAULT_THRESHOLDS;
  }
}

export async function loadFxRates(): Promise<FxRates> {
  try {
    const res = await fetch(`http://localhost:${DAPR_HTTP_PORT}/v1.0/configuration/${CONFIG_STORE}?key=FX-RATES`);
    if (!res.ok) {
      throw new Error(`Dapr configuration fetch failed: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as Record<string, DaprConfigItem>;
    const raw = body["FX-RATES"]?.value;
    if (!raw) {
      throw new Error("FX-RATES key not found in configuration store");
    }
    const rates = JSON.parse(raw) as FxRates;
    return { USD: 1, ...rates };
  } catch (err) {
    console.error("decision-service: failed to load FX rates from Dapr Configuration, using fallback", err);
    return FALLBACK_FX_RATES;
  }
}
