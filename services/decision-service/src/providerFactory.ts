import { GeminiProvider } from "./llm/geminiProvider";
import { StubProvider } from "./llm/stubProvider";
import type { LLMProvider } from "./llm/provider";

const DAPR_HTTP_PORT = process.env.DAPR_HTTP_PORT ? Number(process.env.DAPR_HTTP_PORT) : 3500;

export async function getSecret(name: string): Promise<string> {
  const res = await fetch(`http://localhost:${DAPR_HTTP_PORT}/v1.0/secrets/local-secrets/${name}`);
  if (!res.ok) {
    throw new Error(`failed to load secret "${name}" from Dapr secret store: ${res.status}`);
  }
  const body = (await res.json()) as Record<string, string>;
  return body[name];
}

// Picked once at startup from config - no provider branching elsewhere.
export async function createProvider(llmProviderName: string): Promise<LLMProvider> {
  if (llmProviderName === "gemini") {
    const geminiApiKey = await getSecret("gemini-api-key");
    console.log(`decision-service: loaded LLM provider secret via Dapr (length ${geminiApiKey.length})`);
    return new GeminiProvider(geminiApiKey);
  }
  return new StubProvider();
}
