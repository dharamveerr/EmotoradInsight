import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import getDb from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = params;
  const db = getDb();

  const journey = db
    .prepare("SELECT * FROM journeys WHERE id = ?")
    .get(id) as any;

  if (!journey) {
    return NextResponse.json({ error: "Journey not found" }, { status: 404 });
  }

  return NextResponse.json({
    journey: {
      ...journey,
      structure: JSON.parse(journey.structure),
    },
  });
}
