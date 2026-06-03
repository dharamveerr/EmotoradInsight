"use client";

import { useState, useEffect } from "react";
import Topbar from "@/components/Topbar";
import TreeList from "@/components/TreeList";
import TreeBuilder from "@/components/TreeBuilder";
import VariablePanel from "@/components/VariablePanel";
import { TreeNode, TreeConfig } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";

export default function CreateTreePage() {
  const [trees, setTrees] = useState<TreeConfig[]>([]);
  const [selectedTreeId, setSelectedTreeId] = useState<string | null>(null);
  const [currentTree, setCurrentTree] = useState<TreeNode | null>(null);
  const [draggedVariable, setDraggedVariable] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [treeName, setTreeName] = useState("");

  // Load trees on mount
  useEffect(() => {
    fetchTrees();
  }, []);

  async function fetchTrees() {
    const res = await fetch("/api/trees");
    const data = await res.json();
    setTrees(data.trees || []);
  }

  function createNewTree() {
    const newId = uuidv4();
    const newTree: TreeNode = {
      id: newId,
      name: "Root",
      type: "category",
      conditions: [],
      children: [],
    };
    setCurrentTree(newTree);
    setSelectedTreeId(null);
    setTreeName("Untitled Tree");
  }

  async function loadTree(id: string) {
    const res = await fetch("/api/trees");
    const data = await res.json();
    const tree = data.trees?.find((t: any) => t.id === id);
    if (tree) {
      setSelectedTreeId(id);
      // Fetch full tree structure
      const fullRes = await fetch(`/api/trees?active=false`);
      const fullData = await fullRes.json();
      const fullTree = fullData.trees?.find((t: any) => t.id === id);
      if (fullTree) {
        // Need to fetch structure separately - for now just set name
        setTreeName(tree.name);
        // Reconstruct tree from DB
        fetchFullTree(id);
      }
    }
  }

  async function fetchFullTree(id: string) {
    const res = await fetch("/api/trees");
    const data = await res.json();
    const treeConfig = data.trees?.find((t: any) => t.id === id);
    if (treeConfig) {
      // We need to parse the structure - for MVP, create new empty tree
      const newTree: TreeNode = {
        id: uuidv4(),
        name: treeConfig.name,
        type: "category",
        conditions: [],
        children: [],
      };
      setCurrentTree(newTree);
    }
  }

  async function saveCurrentTree() {
    if (!currentTree || !treeName) {
      alert("Tree name required");
      return;
    }

    setSaving(true);
    try {
      if (selectedTreeId) {
        // Update existing
        const res = await fetch("/api/trees", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: selectedTreeId,
            name: treeName,
            structure: currentTree,
          }),
        });
        if (res.ok) {
          await fetchTrees();
          alert("Tree updated");
        }
      } else {
        // Create new
        const res = await fetch("/api/trees", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: treeName,
            structure: currentTree,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setSelectedTreeId(data.id);
          await fetchTrees();
          alert("Tree saved");
        }
      }
    } finally {
      setSaving(false);
    }
  }

  async function publishTree(id: string) {
    const res = await fetch(`/api/trees/${id}/publish`, {
      method: "POST",
    });
    if (res.ok) {
      await fetchTrees();
      alert("Tree published!");
    }
  }

  async function deleteTree(id: string) {
    const res = await fetch("/api/trees", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      await fetchTrees();
      setCurrentTree(null);
      setSelectedTreeId(null);
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Topbar title="Create Tree" subtitle="Build journey segmentation trees" />

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Tree name input + controls */}
        <div className="flex items-center gap-3 px-7 py-4 border-b border-white/10 bg-white/3">
          <input
            type="text"
            value={treeName}
            onChange={(e) => setTreeName(e.target.value)}
            placeholder="Tree name…"
            className="glass rounded-lg px-4 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500/40 flex-1"
          />

          <button
            onClick={createNewTree}
            className="px-4 py-2 text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg hover:bg-blue-500/30 transition-all"
          >
            New
          </button>

          <button
            onClick={saveCurrentTree}
            disabled={saving || !currentTree}
            className="px-4 py-2 text-xs font-semibold bg-green-500/20 text-green-300 border border-green-500/30 rounded-lg hover:bg-green-500/30 transition-all disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>

          <button
            onClick={() => {
              if (currentTree) {
                const newTree: TreeNode = {
                  id: currentTree.id,
                  name: currentTree.name,
                  type: "category",
                  conditions: [],
                  children: [],
                };
                setCurrentTree(newTree);
              }
            }}
            className="px-4 py-2 text-xs font-semibold bg-gray-500/20 text-gray-300 border border-gray-500/30 rounded-lg hover:bg-gray-500/30 transition-all"
          >
            Reset
          </button>
        </div>

        {/* Three-column layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Tree List */}
          <TreeList
            selectedTreeId={selectedTreeId}
            onSelectTree={loadTree}
            onNewTree={createNewTree}
            onPublishTree={publishTree}
            onDeleteTree={deleteTree}
            onRefresh={fetchTrees}
          />

          {/* Center: Tree Builder */}
          <TreeBuilder
            tree={currentTree}
            draggedVariable={draggedVariable}
            onTreeChange={setCurrentTree}
          />

          {/* Right: Variable Panel */}
          <VariablePanel onDragStart={setDraggedVariable} />
        </div>
      </main>
    </div>
  );
}
