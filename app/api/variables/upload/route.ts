import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createVariable, getVariableByName } from "@/lib/variables";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File;
  const duplicateAction = (formData.get("duplicateAction") as string) || "skip"; // skip, overwrite

  if (!file) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const text = await file.text();
  const errors: string[] = [];
  let imported = 0;

  try {
    let variables: any[] = [];

    if (file.name.endsWith(".csv")) {
      // Parse CSV
      const lines = text.split("\n").map((l) => l.trim()).filter((l) => l);
      if (lines.length === 0) {
        return NextResponse.json({ error: "CSV file is empty" }, { status: 400 });
      }

      // First line is header: name,type,description
      lines.slice(1).forEach((line, idx) => {
        const [name, type, description] = line.split(",").map((s) => s.trim());
        if (!name || !type) {
          errors.push(`Row ${idx + 2}: Missing name or type`);
          return;
        }
        variables.push({ name, type, description: description || undefined });
      });
    } else if (file.name.endsWith(".json")) {
      // Parse JSON
      try {
        variables = JSON.parse(text);
        if (!Array.isArray(variables)) {
          return NextResponse.json(
            { error: "JSON must be an array of variables" },
            { status: 400 }
          );
        }
      } catch (e) {
        return NextResponse.json({ error: "Invalid JSON file" }, { status: 400 });
      }
    } else {
      return NextResponse.json(
        { error: "File must be .csv or .json" },
        { status: 400 }
      );
    }

    // Import variables
    for (const v of variables) {
      try {
        const existing = getVariableByName(v.name);
        if (existing) {
          if (duplicateAction === "skip") {
            errors.push(`Skipped: Variable "${v.name}" already exists`);
            continue;
          }
          // overwrite - just continue (update not implemented in this flow)
          errors.push(`Duplicate: Variable "${v.name}" already exists, skipping`);
          continue;
        }

        createVariable(v.name, v.type, v.description);
        imported++;
      } catch (e: any) {
        errors.push(`Error importing "${v.name}": ${e.message}`);
      }
    }

    return NextResponse.json({
      imported,
      errors,
      total: variables.length,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: `Upload failed: ${e.message}` },
      { status: 500 }
    );
  }
}
