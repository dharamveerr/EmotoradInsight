import getDb from "./db";
import { Variable } from "./types";
import { v4 as uuidv4 } from "uuid";

/**
 * Extract unique variable names from all events metadata
 * Returns sorted list of variable keys found in metadata JSON
 */
export async function getAllVariablesFromDB(): Promise<string[]> {
  const db = await getDb();

  const rows = await db
    .prepare("SELECT DISTINCT metadata FROM events WHERE metadata IS NOT NULL")
    .all<{ metadata: string }>();

  const vars = new Set<string>();

  rows.forEach((row) => {
    try {
      const meta = JSON.parse(row.metadata);
      Object.keys(meta).forEach((key) => vars.add(key));
    } catch {
      // Skip invalid JSON
    }
  });

  return Array.from(vars).sort();
}

/**
 * Get all custom variables from database
 */
export async function getCustomVariables(): Promise<Variable[]> {
  const db = await getDb();
  const rows = await db
    .prepare("SELECT * FROM variables ORDER BY name ASC")
    .all<Variable>();
  return rows;
}

/**
 * Get variable by ID
 */
export async function getVariableById(id: string): Promise<Variable | null> {
  const db = await getDb();
  const row = await db
    .prepare("SELECT * FROM variables WHERE id = ?")
    .get<Variable>(id);
  return row || null;
}

/**
 * Get variable by name
 */
export async function getVariableByName(name: string): Promise<Variable | null> {
  const db = await getDb();
  const row = await db
    .prepare("SELECT * FROM variables WHERE name = ?")
    .get<Variable>(name);
  return row || null;
}

/**
 * Create new variable
 */
export async function createVariable(
  name: string,
  description?: string
): Promise<Variable> {
  const db = await getDb();
  const id = uuidv4();
  const now = new Date().toISOString();

  await db.prepare(
    "INSERT INTO variables (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, name, description || null, now, now);

  return { id, name, description, created_at: now, updated_at: now };
}

/**
 * Update variable
 */
export async function updateVariable(
  id: string,
  name?: string,
  description?: string
): Promise<Variable | null> {
  const db = await getDb();
  const existing = await getVariableById(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  await db.prepare(
    "UPDATE variables SET name = ?, description = ?, updated_at = ? WHERE id = ?"
  ).run(
    name || existing.name,
    description !== undefined ? description : existing.description,
    now,
    id
  );

  return { id, name: name || existing.name, description: description !== undefined ? description : existing.description, created_at: existing.created_at, updated_at: now };
}

/**
 * Delete variable
 */
export async function deleteVariable(id: string): Promise<boolean> {
  const db = await getDb();
  const result = await db.prepare("DELETE FROM variables WHERE id = ?").run(id);
  return result.changes > 0;
}

/**
 * Check if variable is used in any journey
 */
export async function isVariableUsedInJourney(variableId: string): Promise<boolean> {
  const db = await getDb();
  const journeys = await db
    .prepare("SELECT structure FROM journeys")
    .all<{ structure: string }>();

  for (const j of journeys) {
    const structure = JSON.parse(j.structure);
    const used = checkVariableInStructure(structure, variableId);
    if (used) return true;
  }
  return false;
}

function checkStepsForVariable(steps: unknown[], variableId: string): boolean {
  if (!Array.isArray(steps)) return false;
  for (const step of steps as Array<{ options?: unknown[]; children?: unknown[] }>) {
    if (Array.isArray(step.options)) {
      for (const option of step.options as Array<{ storesInVariable?: string; storesInVariables?: string[] }>) {
        if (option.storesInVariable === variableId) return true;
        if (Array.isArray(option.storesInVariables) && option.storesInVariables.includes(variableId)) return true;
      }
    }
    if (Array.isArray(step.children) && checkStepsForVariable(step.children, variableId)) return true;
  }
  return false;
}

function checkVariableInStructure(structure: { steps?: unknown[] } | null | undefined, variableId: string): boolean {
  return checkStepsForVariable(structure?.steps || [], variableId);
}
