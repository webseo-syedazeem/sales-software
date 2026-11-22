import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { appendAudit, loadERPState, saveERPState } from "@/lib/db/repository";
import { hashPassword, validateStrongPassword } from "@/lib/security/password";
import { signSessionToken, SESSION_COOKIE_NAME } from "@/lib/security/auth";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";
import { sanitizePayload } from "@/lib/security/crypto";
import { ROLE_DEFINITIONS } from "@/lib/db/seed";

const setupSchema = z.object({
  companyName: z.string().min(2).max(120),
  ein: z.string().max(40).optional(),
  address: z.string().max(200).optional(),
  cityStateZip: z.string().max(120).optional(),
  phone: z.string().max(40).optional(),
  adminName: z.string().min(2).max(80),
  adminEmail: z.string().email().max(120),
  password: z.string().min(8).max(128),
});

export async function GET() {
  try {
    const state = await loadERPState();
    return NextResponse.json({ setupRequired: state.users.length === 0 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Database unavailable";
    return NextResponse.json({ error: msg, setupRequired: false }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  const limit = await checkRateLimit(`setup:${ip}`, 10, 15 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many setup attempts." }, { status: 429 });
  }

  try {
    const state = await loadERPState();
    if (state.users.length > 0) {
      return NextResponse.json(
        { error: "Enterprise setup has already been completed. Please sign in." },
        { status: 403 }
      );
    }

    const raw = sanitizePayload(await req.json());
    const parsed = setupSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid setup details. Please check company name, admin email, and password." },
        { status: 400 }
      );
    }

    const pwdCheck = validateStrongPassword(parsed.data.password);
    if (!pwdCheck.valid) {
      return NextResponse.json(
        { error: `Password policy failed: ${pwdCheck.errors.join(", ")}` },
        { status: 400 }
      );
    }

    const adminRole = state.roles.find((r) => r.name === "Admin") || ROLE_DEFINITIONS[0];
    const passwordHash = await hashPassword(parsed.data.password);
    const now = new Date().toISOString();
    const email = parsed.data.adminEmail.trim().toLowerCase();

    const adminUser = {
      id: "usr-admin-root",
      name: parsed.data.adminName.trim(),
      email,
      passwordHash,
      role: "Admin" as const,
      branchId: state.branches[0]?.id || "br-hq",
      department: "Executive",
      status: "Active" as const,
      failedLoginAttempts: 0,
      lockoutUntil: null,
      lastLoginAt: now,
      lastLoginIp: ip,
      mfaEnabled: false,
      tokenVersion: 1,
      permissions: { ...adminRole.permissions },
      createdAt: now,
    };

    state.users = [adminUser];
    state.settings = {
      ...state.settings,
      activeCompany: parsed.data.companyName.trim(),
      legalName: parsed.data.companyName.trim(),
      companies: [parsed.data.companyName.trim()],
      ein: parsed.data.ein?.trim() || "",
      address: parsed.data.address?.trim() || "",
      cityStateZip: parsed.data.cityStateZip?.trim() || "",
      phone: parsed.data.phone?.trim() || "",
      email,
    };

    if (state.branches[0]) {
      state.branches[0].managerName = adminUser.name;
      if (parsed.data.address) state.branches[0].address = parsed.data.address.trim();
      if (parsed.data.phone) state.branches[0].phone = parsed.data.phone.trim();
    }

    appendAudit(state, {
      actorName: adminUser.name,
      actorRole: "Admin",
      action: "SECURITY",
      module: "Enterprise Initialization",
      recordId: adminUser.id,
      summary: `Initial Super Admin provisioned for ${state.settings.legalName}; setup endpoint permanently locked.`,
      ipAddress: ip,
      device: req.headers.get("user-agent")?.slice(0, 64) || "Web Client",
    });

    await saveERPState(state, ["users", "settings", "branches", "auditLogs"]);

    const token = await signSessionToken({
      userId: adminUser.id,
      email: adminUser.email,
      name: adminUser.name,
      role: adminUser.role,
      branchId: adminUser.branchId,
      tokenVersion: adminUser.tokenVersion,
      permissions: adminUser.permissions,
    });

    const isHttps =
      req.headers.get("x-forwarded-proto") === "https" ||
      req.nextUrl.protocol === "https:";

    const { passwordHash: _ph, ...safeUser } = adminUser;
    const response = NextResponse.json({ user: safeUser }, { status: 201 });
    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: isHttps,
      path: "/",
      maxAge: 60 * 60 * 8,
    });
    return response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Initialization failed.";
    const status = msg.startsWith("DATABASE_UNAVAILABLE") ? 503 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
