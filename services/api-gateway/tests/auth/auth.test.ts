import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../../src/auth/userStore", () => ({
  getUser: vi.fn(),
  createUser: vi.fn(),
}));

vi.mock("../../src/auth/passwords", () => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
}));

vi.mock("../../src/auth/jwt", () => ({
  signToken: vi.fn(),
  verifyToken: vi.fn(),
}));

import { createUser, getUser } from "../../src/auth/userStore";
import { hashPassword, verifyPassword } from "../../src/auth/passwords";
import { signToken } from "../../src/auth/jwt";
import { app } from "../../src/app";

const createUserMock = vi.mocked(createUser);
const getUserMock = vi.mocked(getUser);
const hashPasswordMock = vi.mocked(hashPassword);
const verifyPasswordMock = vi.mocked(verifyPassword);
const signTokenMock = vi.mocked(signToken);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /auth/register", () => {
  it("rejects a short password", async () => {
    const res = await request(app).post("/auth/register").send({ username: "u1", password: "short", role: "submitter" });

    expect(res.status).toBe(400);
    expect(createUserMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid role", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ username: "u1", password: "longenough1", role: "superadmin" });

    expect(res.status).toBe(400);
  });

  it("rejects a password with no letters", async () => {
    const res = await request(app).post("/auth/register").send({ username: "u1", password: "12345678", role: "submitter" });

    expect(res.status).toBe(400);
    expect(createUserMock).not.toHaveBeenCalled();
  });

  it("rejects a password with no numbers", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ username: "u1", password: "onlyletters", role: "submitter" });

    expect(res.status).toBe(400);
    expect(createUserMock).not.toHaveBeenCalled();
  });

  it("hashes the password and returns a token on success", async () => {
    hashPasswordMock.mockResolvedValue("hashed-pw");
    createUserMock.mockResolvedValue(true);
    signTokenMock.mockResolvedValue("signed-jwt");

    const res = await request(app)
      .post("/auth/register")
      .send({ username: "u1", password: "longenough1", role: "approver" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ token: "signed-jwt", username: "u1", role: "approver" });
    expect(hashPasswordMock).toHaveBeenCalledWith("longenough1");
    expect(createUserMock).toHaveBeenCalledWith({ username: "u1", passwordHash: "hashed-pw", role: "approver" });
    expect(signTokenMock).toHaveBeenCalledWith({ username: "u1", role: "approver" });
  });

  it("returns 409 when the username is already taken", async () => {
    hashPasswordMock.mockResolvedValue("hashed-pw");
    createUserMock.mockResolvedValue(false);

    const res = await request(app)
      .post("/auth/register")
      .send({ username: "u1", password: "longenough1", role: "submitter" });

    expect(res.status).toBe(409);
    expect(signTokenMock).not.toHaveBeenCalled();
  });

  it("returns 500 on an unexpected error", async () => {
    hashPasswordMock.mockRejectedValue(new Error("boom"));

    const res = await request(app)
      .post("/auth/register")
      .send({ username: "u1", password: "longenough1", role: "submitter" });

    expect(res.status).toBe(500);
  });
});

describe("POST /auth/login", () => {
  it("rejects a missing password", async () => {
    const res = await request(app).post("/auth/login").send({ username: "u1" });

    expect(res.status).toBe(400);
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it("returns 401 when the user does not exist", async () => {
    getUserMock.mockResolvedValue(null);

    const res = await request(app).post("/auth/login").send({ username: "ghost", password: "whatever" });

    expect(res.status).toBe(401);
    expect(verifyPasswordMock).not.toHaveBeenCalled();
  });

  it("returns 401 when the password does not match", async () => {
    getUserMock.mockResolvedValue({ username: "u1", passwordHash: "hashed-pw", role: "submitter" });
    verifyPasswordMock.mockResolvedValue(false);

    const res = await request(app).post("/auth/login").send({ username: "u1", password: "wrong" });

    expect(res.status).toBe(401);
    expect(signTokenMock).not.toHaveBeenCalled();
  });

  it("returns a token on a successful login", async () => {
    getUserMock.mockResolvedValue({ username: "u1", passwordHash: "hashed-pw", role: "admin" });
    verifyPasswordMock.mockResolvedValue(true);
    signTokenMock.mockResolvedValue("signed-jwt");

    const res = await request(app).post("/auth/login").send({ username: "u1", password: "correct" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ token: "signed-jwt", username: "u1", role: "admin" });
    expect(signTokenMock).toHaveBeenCalledWith({ username: "u1", role: "admin" });
  });

  it("returns 500 on an unexpected error", async () => {
    getUserMock.mockRejectedValue(new Error("state store down"));

    const res = await request(app).post("/auth/login").send({ username: "u1", password: "whatever" });

    expect(res.status).toBe(500);
  });
});
