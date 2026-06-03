import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import getDb from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, journey, step, timestamp, metadata } = body;

    if (!userId || !journey || !step) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const db = getDb();
    const stmt = db.prepare(
      "INSERT INTO events (id, userId, journey, step, timestamp, metadata) VALUES (?, ?, ?, ?, ?, ?)"
    );
    stmt.run(
      uuidv4(),
      String(userId),
      String(journey),
      String(step),
      timestamp || new Date().toISOString(),
      metadata ? JSON.stringify(metadata) : null
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
