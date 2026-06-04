import getDb from "./db";
import { Variable } from "./types";
import { v4 as uuidv4 } from "uuid";

/**
 * Extract unique variable names from all events metadata
 * Returns sorted list of variable keys found in metadata JSON
 */
export function getAllVariablesFromDB(): string[] {
  const db = getDb();

  const rows = db
    .prepare("SELECT DISTINCT metadata FROM events WHERE metadata IS NOT NULL")
    .all() as { metadata: string }[];

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
export function getCustomVariables(): Variable[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM variables ORDER BY name ASC")
    .all() as Variable[];
  return rows;
}

/**
 * Get variable by ID
 */
export function getVariableById(id: string): Variable | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM variables WHERE id = ?")
    .get(id) as Variable | undefined;
  return row || null;
}

/**
 * Get variable by name
 */
export function getVariableByName(name: string): Variable | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM variables WHERE name = ?")
    .get(name) as Variable | undefined;
  return row || null;
}

/**
 * Create new variable
 */
export function createVariable(
  name: string,
  description?: string
): Variable {
  const db = getDb();
  const id = uuidv4();
  const now = new Date().toISOString();

  db.prepare(
    "INSERT INTO variables (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, name, description || null, now, now);

  return { id, name, description, created_at: now, updated_at: now };
}

/**
 * Update variable
 */
export function updateVariable(
  id: string,
  name?: string,
  description?: string
): Variable | null {
  const db = getDb();
  const existing = getVariableById(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  db.prepare(
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
export function deleteVariable(id: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM variables WHERE id = ?").run(id);
  return result.changes > 0;
}

/**
 * Check if variable is used in any journey
 */
export function isVariableUsedInJourney(variableId: string): boolean {
  const db = getDb();
  const journeys = db
    .prepare("SELECT structure FROM journeys")
    .all() as { structure: string }[];

  for (const j of journeys) {
    const structure = JSON.parse(j.structure);
    const used = checkVariableInStructure(structure, variableId);
    if (used) return true;
  }
  return false;
}

function checkStepsForVariable(steps: any[], variableId: string): boolean {
  if (!Array.isArray(steps)) return false;
  for (const step of steps) {
    if (Array.isArray(step.options)) {
      for (const option of step.options) {
        if (option.storesInVariable === variableId) return true;
        if (Array.isArray(option.storesInVariables) && option.storesInVariables.includes(variableId)) return true;
      }
    }
    if (Array.isArray(step.children) && checkStepsForVariable(step.children, variableId)) return true;
  }
  return false;
}

function checkVariableInStructure(structure: any, variableId: string): boolean {
  return checkStepsForVariable(structure?.steps, variableId);
}
