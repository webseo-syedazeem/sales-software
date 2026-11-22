import { NextResponse } from "next/server";
import { getStorageInfo } from "@/lib/db/repository";

export async function GET() {
  const storage = await getStorageInfo();
  return NextResponse.json({
    status: "healthy",
    service: "ApexLedger Enterprise ERP",
    timestamp: new Date().toISOString(),
    storage,
  });
}
