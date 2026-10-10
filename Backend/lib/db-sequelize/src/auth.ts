import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env["SESSION_SECRET"];

export function requireJwtSecret(): string {
  if (!JWT_SECRET) {
    throw new Error(
      "SESSION_SECRET environment variable is required for authentication but was not provided.",
    );
  }
  return JWT_SECRET;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export interface AuthTokenPayload {
  userId: number;
  username: string;
}

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, requireJwtSecret(), { expiresIn: "7d" });
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  return jwt.verify(token, requireJwtSecret()) as AuthTokenPayload;
}
