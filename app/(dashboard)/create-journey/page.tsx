"use client";

import { useState, useEffect, useCallback } from "react";
import { mutate as swrMutate } from "swr";
import Topbar from "@/components/Topbar";
import TreePanel, { Tree } from "@/components/TreePanel";
import JourneyList from "@/components/JourneyList";
import JourneyBuilder from "@/components/JourneyBuilder";
import VariableManager from "@/components/VariableManager";
import { Journey, Variable } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";

export default function CreateTreePage() {
  const [selectedTree, setSelectedTree] = useState<Tree | null>(null);
  const [variables, setVariables] = useState<Variable[]>([]);
  const [selectedJourneyId, setSelectedJourneyId] = useState<string | null>(null);
  const [currentJourney, setCurrentJourney] = useState<Journey | null>(null);
  const [draggedVariable, setDraggedVariable] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Undo/redo history for the journey being edited
  const [past, setPast] = useState<Journey[]>([]);
  const [future, setFuture] = useState<Journey[]>([]);
  const canUndo = past.length > 0;
  const canRedo = future.length > 0;
  const [journeyName, setJourneyName] = useState("");

  useEffect(() => {
    fetchVariables();
  }, []);

  async function fetchVariables() {
    const res = await fetch("/api/variables");
    const data = await res.json();
    // Merge custom + data-discovered @ vars so any var stored on an option
    // resolves to a chip in the builder. Discovered vars use their name as id.
    const custom: Variable[] = data.variables || [];
    const now = new Date().toISOString();
    const discovered: Variable[] = (data.discovered || []).map((d: { name: string }) => ({
      id: d.name,
      name: d.name,
      created_at: now,
      updated_at: now,
    }));
    setVariables([...custom, ...discovered]);
  }

  function refreshTreeData() {
    swrMutate("/api/trees");
    if (selectedTree) swrMutate(`/api/journeys?tree_id=${selectedTree.id}`);
  }

  function resetHistory() {
    setPast([]);
    setFuture([]);
  }

  // Edits from the builder push the previous state onto the undo stack.
  const editJourney = useCallback((next: Journey) => {
    setCurrentJourney((prev) => {
      if (prev) setPast((p) => [...p, prev]);
      return next;
    });
    setFuture([]);
  }, []);

  const undo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p;
      const prev = p[p.length - 1];
      setCurrentJourney((cur) => {
        if (cur) setFuture((f) => [cur, ...f]);
        return prev;
      });
      return p.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      setCurrentJourney((cur) => {
        if (cur) setPast((p) => [...p, cur]);
        return next;
      });
      return f.slice(1);
    });
  }, []);

  // Keyboard: Cmd/Ctrl+Z undo, Cmd/Ctrl+Shift+Z (or Ctrl+Y) redo
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); redo(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  function handleSelectTree(tree: Tree | null) {
    setSelectedTree(tree);
    setSelectedJourneyId(null);
    setCurrentJourney(null);
    setJourneyName("");
    resetHistory();
  }

  function createNewJourney() {
    if (!selectedTree) {
      alert("Select or create a tree first");
      return;
    }
    const newId = uuidv4();
    const newJourney: Journey = {
      id: newId,
      name: "Untitled Journey",
      description: "",
      steps: [],
      status: "draft",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setCurrentJourney(newJourney);
    setSelectedJourneyId(null);
    setJourneyName("Untitled Journey");
    resetHistory();
  }

  async function loadJourney(id: string) {
    try {
      setSelectedJourneyId(id);

      const res = await fetch(`/api/journeys/${id}`);
      if (!res.ok) {
        let errMessage = res.statusText;
        try {
          const errData = await res.json();
          errMessage = errData.error || errMessage;
        } catch {
          // If response is not JSON, use status text
        }
        alert(`Failed to load journey: ${errMessage}`);
        return;
      }

      const data = await res.json();
      const journeyData = data.journey;
      if (!journeyData) {
        alert("Journey not found");
        return;
      }

      setJourneyName(journeyData.name);
      const fullJourney: Journey = {
        id: journeyData.id,
        name: journeyData.name,
        description: journeyData.description || "",
        steps: journeyData.structure?.steps || [],
        status: journeyData.status,
        published_at: journeyData.published_at,
        created_at: journeyData.created_at,
        updated_at: journeyData.updated_at,
      };
      setCurrentJourney(fullJourney);
      resetHistory();
    } catch (error) {
      alert(`Error loading journey: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function saveCurrentJourney() {
    if (!currentJourney || !journeyName.trim()) {
      alert("Journey name required");
      return;
    }
    if (!selectedTree) {
      alert("Select a tree first");
      return;
    }

    setSaving(true);
    try {
      if (selectedJourneyId) {
        // Update existing
        const res = await fetch("/api/journeys", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: selectedJourneyId,
            name: journeyName.trim(),
            description: currentJourney.description,
            steps: currentJourney.steps,
          }),
        });
        if (res.ok) {
          refreshTreeData();
          alert("Journey updated");
        } else {
          const data = await res.json();
          alert(data.error || "Failed to update journey");
        }
      } else {
        // Create new inside the selected tree
        const res = await fetch("/api/journeys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: journeyName.trim(),
            description: currentJourney.description,
            steps: currentJourney.steps,
            tree_id: selectedTree.id,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          setSelectedJourneyId(data.id);
          refreshTreeData();
          alert("Journey saved");
        } else {
          alert(data.error || "Failed to save journey");
        }
      }
    } finally {
      setSaving(false);
    }
  }

  function deleteJourneyLocal(id: string) {
    if (selectedJourneyId === id) {
      setCurrentJourney(null);
      setSelectedJourneyId(null);
      setJourneyName("");
    }
    swrMutate("/api/trees");
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Topbar
        title="Create Tree"
        subtitle="A tree holds your journeys — publish it to power the dashboard"
      />

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Journey name input + controls */}
        <div className="flex items-center gap-3 px-7 py-4 border-b border-white/10 bg-white/3">
          <div className="flex items-center gap-2 text-sm text-gray-400 shrink-0">
            <span className="text-base">🌳</span>
            <span className="font-semibold text-gray-200">
              {selectedTree ? selectedTree.name : "No tree selected"}
            </span>
            {selectedTree?.status === "published" && (
              <span className="text-xs px-2 py-0.5 rounded font-semibold bg-green-500/40 text-green-200 border border-green-500/50">
                ✓ Live
              </span>
            )}
            <span className="text-gray-600 mx-1">/</span>
          </div>

          <input
            type="text"
            value={journeyName}
            onChange={(e) => setJourneyName(e.target.value)}
            placeholder={selectedTree ? "Journey name…" : "Select a tree first"}
            disabled={!selectedTree}
            className="glass rounded-lg px-4 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500/40 flex-1 disabled:opacity-50"
          />

          <button
            onClick={createNewJourney}
            disabled={!selectedTree}
            className="px-4 py-2 text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg hover:bg-blue-500/30 transition-all disabled:opacity-40"
          >
            New
          </button>

          <button
            onClick={saveCurrentJourney}
            disabled={saving || !currentJourney}
            className="px-4 py-2 text-xs font-semibold bg-green-500/20 text-green-300 border border-green-500/30 rounded-lg hover:bg-green-500/30 transition-all disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>

          <button
            onClick={undo}
            disabled={!canUndo}
            className="px-4 py-2 text-xs font-semibold bg-gray-500/20 text-gray-300 border border-gray-500/30 rounded-lg hover:bg-gray-500/30 transition-all disabled:opacity-40"
            title="Undo (⌘Z)"
          >
            ↶ Undo
          </button>

          <button
            onClick={redo}
            disabled={!canRedo}
            className="px-4 py-2 text-xs font-semibold bg-gray-500/20 text-gray-300 border border-gray-500/30 rounded-lg hover:bg-gray-500/30 transition-all disabled:opacity-40"
            title="Redo (⌘⇧Z)"
          >
            ↷ Redo
          </button>
        </div>

        {/* Four-column layout: Trees | Journeys | Builder | Variables */}
        <div className="flex-1 flex overflow-hidden">
          <TreePanel selectedTreeId={selectedTree?.id || null} onSelectTree={handleSelectTree} />

          <JourneyList
            treeId={selectedTree?.id || null}
            selectedJourneyId={selectedJourneyId}
            onSelectJourney={loadJourney}
            onNewJourney={createNewJourney}
            onDeleteJourney={deleteJourneyLocal}
          />

          <JourneyBuilder
            journey={currentJourney}
            variables={variables}
            draggedVariable={draggedVariable}
            onJourneyChange={editJourney}
          />

          <VariableManager onDragStart={setDraggedVariable} />
        </div>
      </main>
    </div>
  );
}
