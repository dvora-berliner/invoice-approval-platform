const DAPR_HTTP_PORT = process.env.DAPR_HTTP_PORT ?? "3500";
const CONFIG_STORE = "policy-configuration";

interface DaprConfigItem {
  value: string;
  version?: string;
}

export async function loadCeiling(): Promise<number> {
  const res = await fetch(`http://localhost:${DAPR_HTTP_PORT}/v1.0/configuration/${CONFIG_STORE}?key=AUTONOMY-CEILING`);
  if (!res.ok) {
    throw new Error(`Dapr configuration fetch failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as Record<string, DaprConfigItem>;
  const ceiling = Number(body["AUTONOMY-CEILING"]?.value);
  if (!Number.isFinite(ceiling)) {
    throw new Error(`Dapr configuration returned an invalid AUTONOMY-CEILING value: ${JSON.stringify(body)}`);
  }
  return ceiling;
}
