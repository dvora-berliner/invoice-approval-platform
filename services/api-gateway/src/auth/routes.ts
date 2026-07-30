import { Router } from "express";
import { hashPassword, verifyPassword } from "./passwords";
import { signToken } from "./jwt";
import { createUser, getUser } from "./userStore";
import { loginRequestSchema, registerRequestSchema } from "./types";

export const authRouter = Router();

// N1: self-signed JWT auth - the role is caller-supplied at registration (no
// external identity provider), which is an accepted simplification for a demo
// system, not a production trust model.
authRouter.post("/auth/register", async (req, res) => {
  const parseResult = registerRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid registration", details: parseResult.error.flatten() });
    return;
  }
  const { username, password, role } = parseResult.data;

  try {
    const passwordHash = await hashPassword(password);
    const created = await createUser({ username, passwordHash, role });
    if (!created) {
      res.status(409).json({ error: "Username already taken" });
      return;
    }
    const token = await signToken({ username, role });
    res.status(201).json({ token, username, role });
  } catch (err) {
    req.log.error("POST /auth/register failed", { error: String(err) });
    res.status(500).json({ error: "Failed to register" });
  }
});

authRouter.post("/auth/login", async (req, res) => {
  const parseResult = loginRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid login", details: parseResult.error.flatten() });
    return;
  }
  const { username, password } = parseResult.data;

  try {
    const user = await getUser(username);
    const valid = user ? await verifyPassword(password, user.passwordHash) : false;
    if (!user || !valid) {
      res.status(401).json({ error: "Invalid username or password" });
      return;
    }
    const token = await signToken({ username: user.username, role: user.role });
    res.status(200).json({ token, username: user.username, role: user.role });
  } catch (err) {
    req.log.error("POST /auth/login failed", { error: String(err) });
    res.status(500).json({ error: "Failed to log in" });
  }
});
