import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { loadERPState, saveERPState, appendAudit } from "@/lib/db/repository";
import { verifyPassword } from "@/lib/security/password";
import { signSessionToken, SESSION_COOKIE_NAME } from "@/lib/security/auth";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";
import { sanitizePayload } from "@/lib/security/crypto";

const loginSchema = z.object({
  email: z.string().email().max(120),
  password: z.string().min(1).max(128),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  const limit = await checkRateLimit(`login:${ip}`, 15, 5 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many login attempts. Please wait 5 minutes before retrying." },
      { status: 429 }
    );
  }

  try {
    const body = sanitizePayload(await req.json());
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Please provide a valid email and password." },
        { status: 400 }
      );
    }

    const email = parsed.data.email.trim().toLowerCase();
    const password = parsed.data.password;

    const state = await loadERPState();
    if (state.users.length === 0) {
      return NextResponse.json(
        { error: "Enterprise setup is required before signing in." },
        { status: 400 }
      );
    }

    const userIndex = state.users.findIndex((u) => u.email.toLowerCase() === email);
    if (userIndex === -1) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    const user = state.users[userIndex];
    const now = Date.now();

    if (user.status === "Inactive") {
      return NextResponse.json(
        { error: "Account is deactivated. Contact your Enterprise Administrator." },
        { status: 403 }
      );
    }

    if (user.lockoutUntil && new Date(user.lockoutUntil).getTime() > now) {
      return NextResponse.json(
        {
          error:
            "Account temporarily locked due to repeated failed attempts. Try again later or contact Admin.",
        },
        { status: 423 }
      );
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      const attempts = (user.failedLoginAttempts || 0) + 1;
      const maxAttempts = state.settings.maxFailedLogins || 5;
      const locked = attempts >= maxAttempts;

      state.users[userIndex] = {
        ...user,
        failedLoginAttempts: attempts,
        status: locked ? "Locked" : user.status,
        lockoutUntil: locked ? new Date(now + 15 * 60 * 1000).toISOString() : null,
      };

      appendAudit(state, {
        actorName: user.name,
        actorRole: user.role,
        action: "SECURITY",
        module: "Authentication",
        recordId: user.id,
        summary: locked
          ? `Account locked for 15m after ${attempts} failed login attempts`
          : `Failed login attempt (${attempts}/${maxAttempts})`,
        ipAddress: ip,
        device: req.headers.get("user-agent")?.slice(0, 64) || "Web Client",
      });
      await saveERPState(state, ["users", "auditLogs"]);

      return NextResponse.json(
        {
          error: locked
            ? "Account locked for 15 minutes after maximum failed login attempts."
            : "Invalid email or password.",
        },
        { status: locked ? 423 : 401 }
      );
    }

    const tokenVersion = user.tokenVersion || 1;
    state.users[userIndex] = {
      ...user,
      failedLoginAttempts: 0,
      status: "Active",
      lockoutUntil: null,
      tokenVersion,
      lastLoginAt: new Date().toISOString(),
      lastLoginIp: ip,
    };

    appendAudit(state, {
      actorName: user.name,
      actorRole: user.role,
      action: "LOGIN",
      module: "Security",
      recordId: user.id,
      summary: `Authenticated session started (${user.role})`,
      ipAddress: ip,
      device: req.headers.get("user-agent")?.slice(0, 64) || "Web Client",
    });

    await saveERPState(state, ["users", "auditLogs"]);

    const token = await signSessionToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      branchId: user.branchId,
      tokenVersion,
      permissions: user.permissions,
    });

    const { passwordHash: _ph, ...safeUser } = state.users[userIndex];
    const isHttps =
      req.headers.get("x-forwarded-proto") === "https" ||
      req.nextUrl.protocol === "https:";
    const response = NextResponse.json({ user: safeUser });
    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: isHttps,
      path: "/",
      maxAge: 60 * 60 * 8,
    });
    return response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Authentication service error.";
    const status = msg.startsWith("DATABASE_UNAVAILABLE") ? 503 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
