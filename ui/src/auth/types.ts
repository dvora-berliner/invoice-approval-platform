export type Role = "submitter" | "approver" | "admin";

export interface AuthSession {
  token: string;
  username: string;
  role: Role;
}
