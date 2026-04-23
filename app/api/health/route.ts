import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, db: "connected", ts: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json(
      { ok: false, db: "error", error: error instanceof Error ? error.message : "Unknown" },
      { status: 503 }
    );
  }
}
