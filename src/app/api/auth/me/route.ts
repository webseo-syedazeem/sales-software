import { NextResponse } from "next/server";
import { getServerSession, resolveLiveSessionUser } from "@/lib/security/auth";
import { getStorageInfo, loadERPState } from "@/lib/db/repository";

export async function GET() {
  const storage = await getStorageInfo();

  try {
    const state = await loadERPState();
    const setupRequired = state.users.length === 0;
    if (setupRequired) {
      return NextResponse.json(
        { authenticated: false, setupRequired: true, user: null, storage },
        { status: 200 }
      );
    }

    const session = await getServerSession();
    const liveUser = resolveLiveSessionUser(session, state);
    if (!liveUser) {
      return NextResponse.json(
        { authenticated: false, setupRequired: false, user: null, storage },
        { status: 200 }
      );
    }

    const { passwordHash: _ph, ...safeUser } = liveUser;
    return NextResponse.json({
      authenticated: true,
      setupRequired: false,
      user: safeUser,
      storage,
    });
  } catch (err) {
    return NextResponse.json(
      {
        authenticated: false,
        setupRequired: false,
        user: null,
        storage,
        error: err instanceof Error ? err.message : "Database connection error",
      },
      { status: 503 }
    );
  }
}
