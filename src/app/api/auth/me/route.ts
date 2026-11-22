import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/security/auth";
import { getStorageInfo, loadERPState } from "@/lib/db/repository";

export async function GET() {
  const session = await getServerSession();
  const storage = await getStorageInfo();

  if (!session) {
    return NextResponse.json({ authenticated: false, user: null, storage }, { status: 200 });
  }

  const state = await loadERPState();
  const user = state.users.find((u) => u.id === session.userId);
  if (!user) {
    return NextResponse.json({ authenticated: false, user: null, storage }, { status: 200 });
  }

  const { passwordHash: _ph, ...safeUser } = user;
  return NextResponse.json({ authenticated: true, user: safeUser, storage });
}
