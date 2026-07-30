import jwt from "jsonwebtoken";
import type { JwtPayload } from "./types";

const DAPR_HTTP_PORT = process.env.DAPR_HTTP_PORT ? Number(process.env.DAPR_HTTP_PORT) : 3500;
const TOKEN_TTL = "8h";

let cachedSecret: string | undefined;

// Same cold-start retry as decision-service's providerFactory.ts's getSecret - the
// sidecar's HTTP port can take a few seconds to bind after this process starts.
export async function getJwtSecret(retries = 10, delayMs = 1000): Promise<string> {
  if (cachedSecret) return cachedSecret;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`http://localhost:${DAPR_HTTP_PORT}/v1.0/secrets/local-secrets/jwt-secret`);
      if (!res.ok) {
        throw new Error(`failed to load secret "jwt-secret" from Dapr secret store: ${res.status}`);
      }
      const body = (await res.json()) as Record<string, string>;
      cachedSecret = body["jwt-secret"];
      return cachedSecret;
    } catch (err) {
      if (attempt >= retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

export async function signToken(payload: JwtPayload): Promise<string> {
  const secret = await getJwtSecret();
  return jwt.sign(payload, secret, { expiresIn: TOKEN_TTL });
}

export async function verifyToken(token: string): Promise<JwtPayload> {
  const secret = await getJwtSecret();
  return jwt.verify(token, secret) as JwtPayload;
}
