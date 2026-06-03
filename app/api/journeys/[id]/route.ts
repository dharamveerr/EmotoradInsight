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

  try {
    const db = getDb();

    console.log("Fetching journey with ID:", id);

    const journey = db
      .prepare("SELECT * FROM journeys WHERE id = ?")
      .get(id) as any;

    console.log("Query result:", journey);

    if (!journey) {
      return NextResponse.json({ error: "Journey not found" }, { status: 404 });
    }

    let structure: any = { steps: [] };
    if (journey.structure) {
      try {
        structure = JSON.parse(journey.structure);
      } catch (parseError) {
        console.error("Error parsing journey structure:", parseError);
        // Return with empty steps if parse fails
      }
    }

    return NextResponse.json({
      journey: {
        ...journey,
        structure,
      },
    });
  } catch (error) {
    console.error("Error fetching journey:", error);
    return NextResponse.json(
      { error: `Failed to load journey: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
