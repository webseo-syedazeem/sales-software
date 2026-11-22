import { NextResponse } from "next/server";
import { getServerSession, resolveLiveSessionUser } from "@/lib/security/auth";
import { getStorageInfo, loadERPState, sanitizeStateForClient } from "@/lib/db/repository";

export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [state, storage] = await Promise.all([loadERPState(), getStorageInfo()]);
    const liveUser = resolveLiveSessionUser(session, state);
    if (!liveUser) {
      return NextResponse.json({ error: "Session revoked or account inactive." }, { status: 401 });
    }

    return NextResponse.json({
      state: sanitizeStateForClient(state),
      storage,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Database error" },
      { status: 503 }
    );
  }
}
