import { SignJWT, jwtVerify } from "jose";
import crypto from "crypto";
import { cookies } from "next/headers";
import type { ERPDatabaseState, PermissionKey, RoleName, UserAccount } from "@/types/erp";

export const SESSION_COOKIE_NAME = "apexledger_session";

let devEphemeralSecret: string | null = null;

function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "SECURITY MISCONFIGURATION: JWT_SECRET environment variable must be at least 32 characters in production."
      );
    }
    if (!devEphemeralSecret) {
      devEphemeralSecret = crypto.randomBytes(48).toString("hex");
    }
    return new TextEncoder().encode(devEphemeralSecret);
  }
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  role: RoleName;
  branchId: string;
  tokenVersion: number;
  permissions: Record<PermissionKey, boolean>;
}

export async function signSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("apexledger-enterprise")
    .setAudience("apexledger-web")
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      issuer: "apexledger-enterprise",
      audience: "apexledger-web",
    });
    return {
      userId: String(payload.userId),
      email: String(payload.email),
      name: String(payload.name),
      role: payload.role as RoleName,
      branchId: String(payload.branchId),
      tokenVersion: Number(payload.tokenVersion || 1),
      permissions: payload.permissions as Record<PermissionKey, boolean>,
    };
  } catch {
    return null;
  }
}

export async function getServerSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/**
 * Resolves the live UserAccount from MongoDB and enforces active status
 * + tokenVersion match (instant revocation when locked or password changed).
 */
export function resolveLiveSessionUser(
  session: SessionPayload | null,
  state: ERPDatabaseState
): UserAccount | null {
  if (!session) return null;
  const user = state.users.find((u) => u.id === session.userId);
  if (!user) return null;
  if (user.status !== "Active") return null;
  if ((user.tokenVersion || 1) !== (session.tokenVersion || 1)) return null;
  return user;
}

export function hasPermission(
  user: Pick<UserAccount, "role" | "permissions"> | null,
  permission: PermissionKey
): boolean {
  if (!user) return false;
  if (user.role === "Admin") return true;
  return Boolean(user.permissions?.[permission]);
}

export function computeChecksum(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 16).toUpperCase();
}
