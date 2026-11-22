import { SignJWT, jwtVerify } from "jose";
import crypto from "crypto";
import { cookies } from "next/headers";
import type { PermissionKey, RoleName } from "@/types/erp";

export const SESSION_COOKIE_NAME = "apexledger_session";

function getSecretKey(): Uint8Array {
  const secret =
    process.env.JWT_SECRET ||
    "apexledger-enterprise-dev-jwt-secret-change-in-production-64bytes!";
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  role: RoleName;
  branchId: string;
  permissions: Record<PermissionKey, boolean>;
}

export async function signSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("apexledger-enterprise")
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      issuer: "apexledger-enterprise",
    });
    return {
      userId: String(payload.userId),
      email: String(payload.email),
      name: String(payload.name),
      role: payload.role as RoleName,
      branchId: String(payload.branchId),
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

export function hasPermission(
  session: SessionPayload | null,
  permission: PermissionKey
): boolean {
  if (!session) return false;
  if (session.role === "Admin") return true;
  return Boolean(session.permissions?.[permission]);
}

export function computeChecksum(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 16).toUpperCase();
}
