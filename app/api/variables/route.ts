import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getActiveClientId } from "@/lib/client-context";
import {
  getCustomVariables,
  getAllVariablesFromDB,
  getClientVariables,
  deleteClientVariable,
  createVariable,
  updateVariable,
  deleteVariable,
  isVariableUsedInJourney,
} from "@/lib/variables";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientId = await getActiveClientId();
  const variables = await getCustomVariables(clientId);

  // Discover @ variables for the active client from two sources:
  //  1. client_variables — DISTINCT variable_name synced from chat_log_variable (N8N).
  //     Carries is_new so freshly-synced ones can show under a "New" category.
  //  2. event metadata keys — vars seen in already-ingested events (is_new=false).
  // Both surface in the tree's Variables panel alongside manually-added ones.
  const customNames = new Set(variables.map((v) => v.name));
  const seen = new Set<string>(customNames);

  const synced = clientId
    ? (await getClientVariables(clientId)).map((v) => ({ ...v, synced: true }))
    : [];
  const fromEvents = (await getAllVariablesFromDB(clientId)).map((name) => ({ name, is_new: false, synced: false }));

  const discovered = [...synced, ...fromEvents]
    .filter((v) => {
      if (!v.name.startsWith("@") || seen.has(v.name)) return false;
      seen.add(v.name);
      return true;
    })
    .map((v) => ({ name: v.name, is_new: v.is_new, synced: v.synced }));

  return NextResponse.json({ variables, discovered });
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

  const clientId = await getActiveClientId();
  const variable = await createVariable(name, description, clientId);
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

  const { id, name } = await req.json();

  // Synced/discovered variable delete (by name, scoped to active client).
  // These live in client_variables, not the custom `variables` table.
  if (!id && name) {
    const clientId = await getActiveClientId();
    if (!clientId) return NextResponse.json({ error: "No active client" }, { status: 400 });
    const ok = await deleteClientVariable(clientId, String(name));
    if (!ok) return NextResponse.json({ error: "Variable not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  }

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
