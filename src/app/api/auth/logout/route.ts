import { NextRequest, NextResponse } from "next/server";
import { getServerSession, SESSION_COOKIE_NAME } from "@/lib/security/auth";
import { loadERPState, saveERPState, appendAudit } from "@/lib/db/repository";
import { getClientIp } from "@/lib/security/rate-limit";

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (session) {
    const state = await loadERPState();
    appendAudit(state, {
      actorName: session.name,
      actorRole: session.role,
      action: "LOGOUT",
      module: "Security",
      recordId: session.userId,
      summary: "User ended authenticated session",
      ipAddress: getClientIp(req.headers),
      device: req.headers.get("user-agent")?.slice(0, 64) || "Web Client",
    });
    await saveERPState(state, ["auditLogs"]);
  }

  const isHttps =
    req.headers.get("x-forwarded-proto") === "https" ||
    req.nextUrl.protocol === "https:";
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps,
    path: "/",
    maxAge: 0,
  });
  return response;
}
