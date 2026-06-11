import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getCustomVariables,
  createVariable,
  updateVariable,
  deleteVariable,
  isVariableUsedInJourney,
} from "@/lib/variables";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const variables = await getCustomVariables();
  return NextResponse.json({ variables });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let { name, description } = await req.json();

  if (!name) {
    return NextResponse.json(
      { error: "Missing required field: name" },
      { status: 400 }
    );
  }

  // Ensure variable name starts with @
  if (!name.startsWith("@")) {
    name = "@" + name;
  }

  // Validate name format (alphanumeric, underscore, hyphen after @)
  if (!/^@[a-zA-Z_][a-zA-Z0-9_-]*$/.test(name)) {
    return NextResponse.json(
      { error: "Variable name must start with @ and contain only alphanumeric, underscore, or hyphen characters" },
      { status: 400 }
    );
  }

  const variable = await createVariable(name, description);
  return NextResponse.json(variable, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, name, description } = await req.json();

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const variable = await updateVariable(id, name, description);
  if (!variable) {
    return NextResponse.json({ error: "Variable not found" }, { status: 404 });
  }

  return NextResponse.json(variable);
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  if (await isVariableUsedInJourney(id)) {
    return NextResponse.json(
      { error: "Variable is used in one or more journeys. Remove it from journeys before deleting." },
      { status: 400 }
    );
  }

  const success = await deleteVariable(id);
  if (!success) {
    return NextResponse.json({ error: "Variable not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
