import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/security/auth";
import { getStorageInfo, loadERPState, sanitizeStateForClient } from "@/lib/db/repository";

export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [state, storage] = await Promise.all([loadERPState(), getStorageInfo()]);
  return NextResponse.json({
    state: sanitizeStateForClient(state),
    storage,
  });
}
