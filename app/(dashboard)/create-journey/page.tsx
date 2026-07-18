"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import useSWR, { mutate as swrMutate } from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());
import Topbar from "@/components/Topbar";
import TreePanel, { Tree } from "@/components/TreePanel";
import JourneyList from "@/components/JourneyList";
import JourneyBuilder from "@/components/JourneyBuilder";
import VariableManager from "@/components/VariableManager";
import { Journey, Variable } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";

export default function CreateTreePage() {
  const [selectedTree, setSelectedTree] = useState<Tree | null>(null);
  const [selectedJourneyId, setSelectedJourneyId] = useState<string | null>(null);
  const [currentJourney, setCurrentJourney] = useState<Journey | null>(null);
  const [draggedVariable, setDraggedVariable] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [expandedTrees, setExpandedTrees] = useState<Record<string, boolean>>({});
  const [treeJourneys, setTreeJourneys] = useState<Record<string, Journey[]>>({});
  const [togglingTreeId, setTogglingTreeId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [nameDialog, setNameDialog] = useState<{
    mode: "create-tree" | "rename-tree" | "copy-tree" | "copy-journey" | "rename-journey";
    treeId?: string;
    journeyId?: string;
    value: string;
  } | null>(null);
  const [nameDialogSaving, setNameDialogSaving] = useState(false);
  const [nameDialogError, setNameDialogError] = useState<string | null>(null);

  // Undo/redo history for the journey being edited
  const [past, setPast] = useState<Journey[]>([]);
  const [future, setFuture] = useState<Journey[]>([]);
  const canUndo = past.length > 0;
  const canRedo = future.length > 0;
  const [journeyName, setJourneyName] = useState("");

  // Fetch trees and journeys for selection screen
  const { data: treesData, isLoading: treesLoading } = useSWR("/api/trees", fetcher);
  const allTrees: Tree[] = treesData?.trees || [];
  const { data: journeysData } = useSWR(
    selectedTree ? `/api/journeys?tree_id=${selectedTree.id}` : null,
    fetcher
  );

  // Shared SWR key with VariableManager — when the panel syncs/adds/deletes and
  // calls mutate("/api/variables"), this list revalidates too, so newly-synced
  // variables become draggable/selectable in the builder without a page reload.
  const { data: varsData } = useSWR("/api/variables", fetcher);
  const variables: Variable[] = useMemo(() => {
    if (!varsData) return [];
    // Merge custom + data-discovered @ vars so any var stored on an option
    // resolves to a chip in the builder. Discovered vars use their name as id.
    const custom: Variable[] = varsData.variables || [];
    const now = new Date().toISOString();
    const seen = new Set(custom.map((v) => v.id));
    const discovered: Variable[] = [];
    for (const d of (varsData.discovered || []) as { name: string }[]) {
      if (seen.has(d.name)) continue; // same @name across templates → one chip
      seen.add(d.name);
      discovered.push({ id: d.name, name: d.name, created_at: now, updated_at: now });
    }
    return [...custom, ...discovered];
  }, [varsData]);

  function refreshTreeData() {
    swrMutate("/api/trees");
    if (selectedTree) swrMutate(`/api/journeys?tree_id=${selectedTree.id}`);
  }

  const [relabeling, setRelabeling] = useState(false);

  async function runRelabel() {
    setRelabeling(true);
    try {
      const res = await fetch("/api/admin/relabel", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setToast({ message: `Relabeled ${data.updated} event(s), reassigned ${data.reassigned}, reverted ${data.reverted}`, type: "success" });
        swrMutate("/api/trees");
      } else {
        setToast({ message: data.error || "Failed to fix journey data", type: "error" });
      }
    } catch (e) {
      setToast({ message: `Error: ${e instanceof Error ? e.message : String(e)}`, type: "error" });
    } finally {
      setRelabeling(false);
      setTimeout(() => setToast(null), 5000);
    }
  }

  async function toggleTreePublish(tree: Tree) {
    const action = tree.status === "published" ? "unpublish" : "publish";
    setTogglingTreeId(tree.id);
    try {
      const res = await fetch(`/api/trees/${tree.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        swrMutate("/api/trees");
      } else {
        const data = await res.json();
        setToast({ message: data.error || `Failed to ${action} tree`, type: "error" });
        setTimeout(() => setToast(null), 4000);
      }
    } catch (e) {
      setToast({ message: `Error: ${e instanceof Error ? e.message : String(e)}`, type: "error" });
      setTimeout(() => setToast(null), 4000);
    } finally {
      setTogglingTreeId(null);
    }
  }

  function deleteTree(tree: Tree) {
    if (tree.status === "published") {
      setToast({ message: "Cannot delete a published tree. Unpublish its journeys first.", type: "error" });
      setTimeout(() => setToast(null), 4000);
      return;
    }
    setConfirmDialog({
      title: "Delete Tree",
      message: `Delete tree "${tree.name}" and all its journeys? This cannot be undone.`,
      onConfirm: async () => {
        setConfirmBusy(true);
        try {
          const res = await fetch("/api/trees", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: tree.id }),
          });
          if (res.ok) {
            swrMutate("/api/trees");
          } else {
            const data = await res.json();
            setToast({ message: data.error || "Failed to delete tree", type: "error" });
            setTimeout(() => setToast(null), 4000);
          }
        } catch (e) {
          setToast({ message: `Error: ${e instanceof Error ? e.message : String(e)}`, type: "error" });
          setTimeout(() => setToast(null), 4000);
        } finally {
          setConfirmBusy(false);
          setConfirmDialog(null);
        }
      },
    });
  }

  function openCreateTreeDialog() {
    setNameDialogError(null);
    setNameDialog({ mode: "create-tree", value: "" });
  }

  function openRenameTreeDialog(tree: Tree) {
    setNameDialogError(null);
    setNameDialog({ mode: "rename-tree", treeId: tree.id, value: tree.name });
  }

  function openCopyTreeDialog(tree: Tree) {
    setNameDialogError(null);
    setNameDialog({ mode: "copy-tree", treeId: tree.id, value: `${tree.name} (Copy)` });
  }

  function openCopyJourneyDialog(tree: Tree, journey: Journey) {
    setNameDialogError(null);
    setNameDialog({ mode: "copy-journey", treeId: tree.id, journeyId: journey.id, value: `${journey.name} (Copy)` });
  }

  function openRenameJourneyDialog(tree: Tree, journey: Journey) {
    setNameDialogError(null);
    setNameDialog({ mode: "rename-journey", treeId: tree.id, journeyId: journey.id, value: journey.name });
  }

  async function submitNameDialog() {
    if (!nameDialog) return;
    const name = nameDialog.value.trim();
    if (!name) {
      const isJourney = nameDialog.mode === "copy-journey" || nameDialog.mode === "rename-journey";
      setNameDialogError(`${isJourney ? "Journey" : "Tree"} name is required`);
      return;
    }
    setNameDialogSaving(true);
    setNameDialogError(null);
    try {
      if (nameDialog.mode === "create-tree") {
        const res = await fetch("/api/trees", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        const data = await res.json();
        if (res.ok) {
          swrMutate("/api/trees");
          setSelectedTree({
            id: data.id,
            name: data.name,
            status: "draft",
            journey_count: 0,
            created_at: data.created_at,
            updated_at: data.created_at,
          });
          setShowEditor(true);
          setNameDialog(null);
        } else {
          setNameDialogError(data.error || "Failed to create tree");
        }
      } else if (nameDialog.mode === "rename-tree") {
        const res = await fetch("/api/trees", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: nameDialog.treeId, name }),
        });
        const data = await res.json();
        if (res.ok) {
          swrMutate("/api/trees");
          if (selectedTree?.id === nameDialog.treeId) {
            setSelectedTree((t) => (t ? { ...t, name } : t));
          }
          setNameDialog(null);
          setToast({ message: "Tree renamed", type: "success" });
          setTimeout(() => setToast(null), 3000);
        } else {
          setNameDialogError(data.error || "Failed to rename tree");
        }
      } else if (nameDialog.mode === "copy-tree") {
        const res = await fetch("/api/trees/duplicate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ treeId: nameDialog.treeId, name }),
        });
        const data = await res.json();
        if (res.ok) {
          swrMutate("/api/trees");
          setNameDialog(null);
          setToast({ message: `Copied as "${data.name}"`, type: "success" });
          setTimeout(() => setToast(null), 3000);
        } else {
          setNameDialogError(data.error || "Failed to copy tree");
        }
      } else if (nameDialog.mode === "copy-journey") {
        const treeId = nameDialog.treeId!;
        const res = await fetch(`/api/journeys/${nameDialog.journeyId}`);
        const { journey: journeyData } = await res.json();
        const newJourney: Journey = {
          id: uuidv4(),
          name,
          description: journeyData.description,
          steps: JSON.parse(JSON.stringify(journeyData.structure?.steps || [])),
          status: "draft",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const postRes = await fetch("/api/journeys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tree_id: treeId, ...newJourney }),
        });
        const postData = await postRes.json();
        if (postRes.ok) {
          setTreeJourneys((tj) => ({
            ...tj,
            [treeId]: [...(tj[treeId] || []), { ...newJourney, id: postData.id || newJourney.id }],
          }));
          refreshTreeData();
          setNameDialog(null);
          setToast({ message: `Copied as "${name}"`, type: "success" });
          setTimeout(() => setToast(null), 3000);
        } else {
          setNameDialogError(postData.error || "Failed to copy journey");
        }
      } else if (nameDialog.mode === "rename-journey") {
        const treeId = nameDialog.treeId!;
        const journeyId = nameDialog.journeyId!;
        const getRes = await fetch(`/api/journeys/${journeyId}`);
        const { journey: journeyData } = await getRes.json();
        const res = await fetch("/api/journeys", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: journeyId,
            name,
            description: journeyData.description,
            steps: journeyData.structure?.steps || [],
          }),
        });
        const data = await res.json();
        if (res.ok) {
          setTreeJourneys((tj) => ({
            ...tj,
            [treeId]: (tj[treeId] || []).map((j) => (j.id === journeyId ? { ...j, name } : j)),
          }));
          if (selectedJourneyId === journeyId) setJourneyName(name);
          refreshTreeData();
          setNameDialog(null);
          setToast({ message: "Journey renamed", type: "success" });
          setTimeout(() => setToast(null), 3000);
        } else {
          setNameDialogError(data.error || "Failed to rename journey");
        }
      }
    } catch (e) {
      setNameDialogError(e instanceof Error ? e.message : String(e));
    } finally {
      setNameDialogSaving(false);
    }
  }

  async function toggleTreeExpanded(treeId: string) {
    const isExpanding = !expandedTrees[treeId];
    setExpandedTrees((t) => ({ ...t, [treeId]: isExpanding }));

    if (isExpanding && !treeJourneys[treeId]) {
      try {
        const res = await fetch(`/api/journeys?tree_id=${treeId}`);
        if (res.ok) {
          const data = await res.json();
          setTreeJourneys((tj) => ({ ...tj, [treeId]: data.journeys || [] }));
        }
      } catch (e) {
        console.error("Failed to fetch journeys:", e);
      }
    }
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

  function createNewJourney(targetTree?: Tree) {
    const tree = targetTree ?? selectedTree;
    if (!tree) {
      setToast({ message: "Select or create a tree first", type: "error" });
      setTimeout(() => setToast(null), 4000);
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
    setSelectedTree(tree);
    setCurrentJourney(newJourney);
    setSelectedJourneyId(null);
    setJourneyName("Untitled Journey");
    resetHistory();
    setShowEditor(true);
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
        setToast({ message: `Failed to load journey: ${errMessage}`, type: "error" });
        setTimeout(() => setToast(null), 4000);
        return;
      }

      const data = await res.json();
      const journeyData = data.journey;
      if (!journeyData) {
        setToast({ message: "Journey not found", type: "error" });
        setTimeout(() => setToast(null), 4000);
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
      setShowEditor(true);
    } catch (error) {
      setToast({ message: `Error loading journey: ${error instanceof Error ? error.message : String(error)}`, type: "error" });
      setTimeout(() => setToast(null), 4000);
    }
  }

  async function saveCurrentJourney() {
    if (!currentJourney || !journeyName.trim()) {
      setToast({ message: "Journey name required", type: "error" });
      setTimeout(() => setToast(null), 4000);
      return;
    }
    if (!selectedTree) {
      setToast({ message: "Select a tree first", type: "error" });
      setTimeout(() => setToast(null), 4000);
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
          setToast({ message: "Journey updated successfully", type: "success" });
          setTimeout(() => setToast(null), 3000);
        } else {
          const data = await res.json();
          setToast({ message: data.error || "Failed to update journey", type: "error" });
          setTimeout(() => setToast(null), 4000);
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
          setToast({ message: "Journey saved", type: "success" });
          setTimeout(() => setToast(null), 3000);
        } else {
          setToast({ message: data.error || "Failed to save journey", type: "error" });
          setTimeout(() => setToast(null), 4000);
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

  async function publishJourney() {
    if (!selectedJourneyId) return;
    try {
      const res = await fetch("/api/journeys", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedJourneyId,
          status: "published",
        }),
      });
      if (res.ok) {
        setCurrentJourney((j) => j ? { ...j, status: "published" } : null);
        refreshTreeData();
        setToast({ message: "Journey published", type: "success" });
        setTimeout(() => setToast(null), 3000);
      } else {
        const data = await res.json();
        setToast({ message: data.error || "Failed to publish journey", type: "error" });
        setTimeout(() => setToast(null), 4000);
      }
    } catch (e) {
      setToast({ message: `Error: ${e instanceof Error ? e.message : String(e)}`, type: "error" });
      setTimeout(() => setToast(null), 4000);
    }
  }

  async function unpublishJourney() {
    if (!selectedJourneyId) return;
    try {
      const res = await fetch("/api/journeys", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedJourneyId,
          status: "draft",
        }),
      });
      if (res.ok) {
        setCurrentJourney((j) => j ? { ...j, status: "draft" } : null);
        refreshTreeData();
        setToast({ message: "Journey reverted to draft", type: "success" });
        setTimeout(() => setToast(null), 3000);
      } else {
        const data = await res.json();
        setToast({ message: data.error || "Failed to unpublish journey", type: "error" });
        setTimeout(() => setToast(null), 4000);
      }
    } catch (e) {
      setToast({ message: `Error: ${e instanceof Error ? e.message : String(e)}`, type: "error" });
      setTimeout(() => setToast(null), 4000);
    }
  }

  function deleteJourney() {
    if (!selectedJourneyId) return;
    setConfirmDialog({
      title: "Delete Journey",
      message: "Delete this journey? This cannot be undone.",
      onConfirm: async () => {
        setConfirmBusy(true);
        try {
          const res = await fetch("/api/journeys", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: selectedJourneyId }),
          });
          if (res.ok) {
            setShowEditor(false);
            setCurrentJourney(null);
            setSelectedJourneyId(null);
            refreshTreeData();
            setToast({ message: "Journey deleted", type: "success" });
            setTimeout(() => setToast(null), 3000);
          } else {
            const data = await res.json();
            setToast({ message: data.error || "Failed to delete journey", type: "error" });
            setTimeout(() => setToast(null), 4000);
          }
        } catch (e) {
          setToast({ message: `Error: ${e instanceof Error ? e.message : String(e)}`, type: "error" });
          setTimeout(() => setToast(null), 4000);
        } finally {
          setConfirmBusy(false);
          setConfirmDialog(null);
        }
      },
    });
  }

  const [treeSearch, setTreeSearch] = useState("");

  if (!showEditor) {
    const visibleTrees = allTrees.filter((t) =>
      t.name.toLowerCase().includes(treeSearch.toLowerCase())
    );

    // Selection screen: browse trees + journeys with full details
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar
          title="Create Tree"
          subtitle="Manage your journey flows — select to edit or create new"
        />
        {toast && (
          <div className={`fixed bottom-6 right-6 z-[100] px-5 py-3 rounded-xl border shadow-2xl backdrop-blur-md flex items-center gap-3 ${
            toast.type === "success"
              ? "bg-green-500/20 border-green-500/30 text-green-300"
              : "bg-red-500/20 border-red-500/30 text-red-300"
          }`}>
            <span className="text-sm font-medium">{toast.message}</span>
            <button onClick={() => setToast(null)} className="text-lg opacity-60 hover:opacity-100">✕</button>
          </div>
        )}
        {confirmDialog && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
            <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0f1420] shadow-2xl p-6">
              <h3 className="text-base font-semibold text-gray-100 mb-2">{confirmDialog.title}</h3>
              <p className="text-sm text-gray-400 mb-6">{confirmDialog.message}</p>
              <div className="flex justify-center gap-3">
                <button
                  onClick={() => setConfirmDialog(null)}
                  disabled={confirmBusy}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-center bg-gray-500/20 text-gray-300 border border-gray-500/30 rounded-lg hover:bg-gray-500/30 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDialog.onConfirm}
                  disabled={confirmBusy}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-center bg-red-500/20 text-red-300 border border-red-500/40 rounded-lg hover:bg-red-500/30 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {confirmBusy ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          </div>
        )}
        {nameDialog && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
            <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0f1420] shadow-2xl p-6">
              <h3 className="text-base font-semibold text-gray-100 mb-4">
                {{
                  "create-tree": "Create Tree",
                  "rename-tree": "Rename Tree",
                  "copy-tree": "Copy Tree",
                  "copy-journey": "Copy Journey",
                  "rename-journey": "Rename Journey",
                }[nameDialog.mode]}
              </h3>
              <input
                autoFocus
                type="text"
                value={nameDialog.value}
                onChange={(e) => setNameDialog((d) => (d ? { ...d, value: e.target.value } : d))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitNameDialog();
                  if (e.key === "Escape") setNameDialog(null);
                }}
                placeholder={
                  nameDialog.mode === "copy-journey" || nameDialog.mode === "rename-journey"
                    ? "Journey name…"
                    : "Tree name…"
                }
                className="w-full bg-white/10 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-green-500/40 mb-2"
              />
              {nameDialogError && (
                <p className="text-xs text-red-400 mb-2">{nameDialogError}</p>
              )}
              <div className="flex justify-center gap-3 mt-4">
                <button
                  onClick={() => setNameDialog(null)}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-center bg-gray-500/20 text-gray-300 border border-gray-500/30 rounded-lg hover:bg-gray-500/30 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={submitNameDialog}
                  disabled={nameDialogSaving}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-center bg-green-500/20 text-green-300 border border-green-500/40 rounded-lg hover:bg-green-500/30 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {nameDialogSaving ? "Saving…" : nameDialog.mode === "create-tree" ? "Create" : nameDialog.mode.startsWith("copy") ? "Copy" : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Header section with Create Tree CTA */}
          <div className="border-b border-white/10 bg-gradient-to-r from-white/5 to-white/2 px-6 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-200 mb-1">Journey Trees</h2>
                <p className="text-sm text-gray-400">Organize and manage your chatbot journeys</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={runRelabel}
                  disabled={relabeling}
                  title="Re-maps events stored under raw bot template IDs to the published tree's journey/step names — fixes 0-count funnels caused by a key mismatch"
                  className="px-4 py-3 bg-white/5 text-gray-300 border border-white/10 rounded-lg hover:bg-white/10 transition-all font-semibold shadow-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {relabeling ? "Fixing…" : "Fix Journey Data"}
                </button>
                <button
                  onClick={openCreateTreeDialog}
                  className="px-6 py-3 bg-gradient-to-r from-green-500/20 to-green-600/20 text-green-300 border border-green-500/40 rounded-lg hover:from-green-500/30 hover:to-green-600/30 transition-all font-semibold shadow-lg cursor-pointer"
                >
                  + Create Tree
                </button>
              </div>
            </div>

            {/* Tree search */}
            <div className="mt-4">
              <input
                type="text"
                placeholder="🔍 Search trees…"
                value={treeSearch}
                onChange={(e) => setTreeSearch(e.target.value)}
                className="w-full max-w-xs glass px-3 py-2 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/40"
              />
            </div>
          </div>

          {/* Trees list */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Column header */}
            {!treesLoading && visibleTrees.length > 0 && (
              <div className="flex items-center gap-4 px-6 pb-2 mb-2 border-b border-white/10">
                <div className="flex-1 min-w-0 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tree Name</div>
                <div className="hidden md:block w-40 shrink-0 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Created</div>
                <div className="hidden md:block w-40 shrink-0 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Updated</div>
                <div className="w-[260px] shrink-0 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</div>
              </div>
            )}
            <div className="space-y-4">
            {treesLoading ? (
              <div className="text-center py-8">
                <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white/10 mb-2">
                  <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                </div>
                <p className="text-gray-400">Loading trees…</p>
              </div>
            ) : allTrees.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center max-w-sm">
                  <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-4">
                    <span className="text-2xl">🌳</span>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-200 mb-2">No trees yet</h3>
                  <p className="text-gray-400 mb-6">Create your first journey tree to get started organizing your chatbot flows.</p>
                  <button
                    onClick={openCreateTreeDialog}
                    className="px-6 py-3 bg-gradient-to-r from-green-500/20 to-green-600/20 text-green-300 border border-green-500/40 rounded-lg hover:from-green-500/30 hover:to-green-600/30 transition-all font-semibold cursor-pointer"
                  >
                    + Create First Tree
                  </button>
                </div>
              </div>
            ) : visibleTrees.length === 0 ? (
              <div className="text-center py-12 text-gray-500 text-sm">
                No trees match &ldquo;{treeSearch}&rdquo;
              </div>
            ) : (
              visibleTrees.map((tree) => (
                <div key={tree.id} className="glass rounded-xl border border-white/20 overflow-hidden hover:border-white/30 transition-all">
                  {/* Tree header: Name | Created | Updated | Actions */}
                  <div className="flex items-center gap-4 px-6 py-4">
                    {/* Name (click to expand) */}
                    <button
                      onClick={() => toggleTreeExpanded(tree.id)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
                    >
                      <span className="text-sm text-gray-400 shrink-0">{expandedTrees[tree.id] ? "▼" : "▶"}</span>
                      <span className="text-xl shrink-0">🌳</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-gray-200 truncate">{tree.name}</p>
                          {tree.status === "published" && (
                            <span className="px-2 py-0.5 bg-green-500/20 text-green-300 border border-green-500/40 rounded-full text-xs font-semibold shrink-0">✓ Live</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">
                          {(() => {
                            const count = treeJourneys[tree.id]?.length ?? tree.journey_count ?? 0;
                            return `${count} journey${count !== 1 ? "s" : ""}`;
                          })()}
                        </p>
                      </div>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openRenameTreeDialog(tree);
                      }}
                      title="Rename tree"
                      className="shrink-0 text-gray-500 hover:text-blue-300 transition-colors px-1 cursor-pointer"
                    >
                      ✎
                    </button>

                    {/* Created */}
                    <div className="hidden md:block text-xs text-gray-500 w-40 shrink-0 text-center">
                      {new Date(tree.created_at).toLocaleString()}
                    </div>

                    {/* Updated */}
                    <div className="hidden md:block text-xs text-gray-500 w-40 shrink-0 text-center">
                      {new Date(tree.updated_at).toLocaleString()}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0 w-[260px]">
                      <button
                        onClick={() => toggleTreePublish(tree)}
                        disabled={togglingTreeId === tree.id}
                        title={tree.status === "published" ? "Set tree inactive (unpublish)" : "Set tree active (publish)"}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                          tree.status === "published"
                            ? "bg-green-500/20 text-green-900 dark:text-green-500 border-green-600/60 hover:bg-green-500/30"
                            : "bg-orange-500/20 text-orange-900 dark:text-orange-500 border-orange-600/60 hover:bg-orange-500/30"
                        } ${togglingTreeId === tree.id ? "opacity-60 cursor-not-allowed" : ""}`}
                      >
                        {togglingTreeId === tree.id ? "Loading…" : (tree.status === "published" ? "Active" : "Inactive")}
                      </button>
                      <button
                        onClick={() => openCopyTreeDialog(tree)}
                        title="Copy this tree (with all its journeys) within your account"
                        className="px-3 py-1.5 text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-lg hover:bg-purple-500/30 transition-all cursor-pointer"
                      >
                        Copy
                      </button>
                      <button
                        onClick={() => deleteTree(tree)}
                        disabled={tree.status === "published"}
                        title={tree.status === "published" ? "Set inactive before deleting" : "Delete tree"}
                        className="px-3 py-1.5 text-xs font-semibold bg-red-500/20 text-red-300 border border-red-500/30 rounded-lg hover:bg-red-500/30 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Journey list */}
                  {expandedTrees[tree.id] && (
                    <div className="border-t border-white/10 bg-white/2">
                      {/* Create journey button */}
                      <div className="p-4 pb-2">
                        <button
                          onClick={() => createNewJourney(tree)}
                          className="w-full px-3 py-2 text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg hover:bg-blue-500/30 transition-all"
                        >
                          + Create Journey
                        </button>
                      </div>
                      {/* Journeys */}
                      <div className="space-y-2 px-4 pb-4">
                        {treeJourneys[tree.id]?.length ? (
                          treeJourneys[tree.id].map((journey: Journey) => (
                              <div key={journey.id} className="flex items-center gap-4 px-4 py-3 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 hover:border-white/20 transition-all">
                                {/* Name (click to edit) */}
                                <button
                                  onClick={() => {
                                    setSelectedTree(tree);
                                    loadJourney(journey.id);
                                  }}
                                  className="flex items-center gap-2 flex-1 min-w-0 text-left"
                                >
                                  <span className="text-gray-500 shrink-0">→</span>
                                  <span className="font-semibold text-gray-200 hover:text-blue-300 transition-colors truncate">{journey.name}</span>
                                  {tree.status !== "published" && journey.status === "published" && (
                                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold whitespace-nowrap shrink-0 bg-green-500/20 text-green-300 border border-green-500/40">
                                      ✓ Published
                                    </span>
                                  )}
                                </button>

                                {/* Actions */}
                                <div className="flex items-center gap-2 shrink-0">
                                  <button
                                    onClick={() => {
                                      setSelectedTree(tree);
                                      loadJourney(journey.id);
                                    }}
                                    className="px-3 py-1.5 text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg hover:bg-blue-500/30 transition-all cursor-pointer"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => openRenameJourneyDialog(tree, journey)}
                                    className="px-3 py-1.5 text-xs font-semibold bg-gray-500/20 text-gray-300 border border-gray-500/30 rounded-lg hover:bg-gray-500/30 transition-all cursor-pointer"
                                  >
                                    Rename
                                  </button>
                                  <button
                                    onClick={() => openCopyJourneyDialog(tree, journey)}
                                    className="px-3 py-1.5 text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-lg hover:bg-purple-500/30 transition-all cursor-pointer"
                                  >
                                    Copy
                                  </button>
                                  <button
                                    onClick={() => {
                                      setConfirmDialog({
                                        title: "Delete Journey",
                                        message: `Delete "${journey.name}"? This cannot be undone.`,
                                        onConfirm: async () => {
                                          setConfirmBusy(true);
                                          try {
                                            const res = await fetch("/api/journeys", {
                                              method: "DELETE",
                                              headers: { "Content-Type": "application/json" },
                                              body: JSON.stringify({ id: journey.id }),
                                            });
                                            if (res.ok) {
                                              setTreeJourneys((tj) => ({
                                                ...tj,
                                                [tree.id]: tj[tree.id].filter((j) => j.id !== journey.id),
                                              }));
                                              refreshTreeData();
                                            } else {
                                              const data = await res.json();
                                              setToast({ message: data.error || "Failed to delete journey", type: "error" });
                                              setTimeout(() => setToast(null), 4000);
                                            }
                                          } catch (e) {
                                            setToast({ message: `Error: ${e}`, type: "error" });
                                            setTimeout(() => setToast(null), 4000);
                                          } finally {
                                            setConfirmBusy(false);
                                            setConfirmDialog(null);
                                          }
                                        },
                                      });
                                    }}
                                    className="px-3 py-1.5 text-xs font-semibold bg-red-500/20 text-red-300 border border-red-500/30 rounded-lg hover:bg-red-500/30 transition-all cursor-pointer"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            ))
                        ) : (
                          <p className="text-sm text-gray-500 text-center py-4">No journeys in this tree</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Topbar
        title="Create Tree"
        subtitle="A tree holds your journeys — publish it to power the dashboard"
      />

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[100] px-5 py-3 rounded-xl border shadow-2xl backdrop-blur-md flex items-center gap-3 ${
          toast.type === "success"
            ? "bg-green-500/20 border-green-500/30 text-green-300"
            : "bg-red-500/20 border-red-500/30 text-red-300"
        }`}>
          <span className="text-sm font-medium">{toast.message}</span>
          <button onClick={() => setToast(null)} className="text-lg opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Confirm dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0f1420] shadow-2xl p-6">
            <h3 className="text-base font-semibold text-gray-100 mb-2">{confirmDialog.title}</h3>
            <p className="text-sm text-gray-400 mb-6">{confirmDialog.message}</p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => setConfirmDialog(null)}
                disabled={confirmBusy}
                className="flex-1 px-4 py-2.5 text-sm font-semibold text-center bg-gray-500/20 text-gray-300 border border-gray-500/30 rounded-lg hover:bg-gray-500/30 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={confirmDialog.onConfirm}
                disabled={confirmBusy}
                className="flex-1 px-4 py-2.5 text-sm font-semibold text-center bg-red-500/20 text-red-300 border border-red-500/40 rounded-lg hover:bg-red-500/30 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {confirmBusy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header with tree/journey info and controls */}
        <div className="border-b border-white/10 bg-white/3">
          {/* Top row: Back button + tree name + status */}
          <div className="flex items-center gap-2 sm:gap-3 px-4 sm:px-7 py-3 sm:py-4 flex-wrap">
            <button
              onClick={() => setShowEditor(false)}
              className="px-3 py-2 text-xs font-semibold bg-gray-500/20 text-gray-300 border border-gray-500/30 rounded hover:bg-gray-500/30 transition-all"
              title="Back to journey selection"
            >
              ← Back
            </button>
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <span className="text-base">🌳</span>
              <span className="font-semibold text-gray-200">
                {selectedTree?.name || "No tree selected"}
              </span>
            </div>
            <span className="text-gray-600">/</span>
            <span className="font-semibold text-gray-200">{journeyName || "New Journey"}</span>
            {currentJourney?.status === "published" && (
              <span className="text-xs px-2 py-0.5 rounded font-semibold bg-green-500/40 text-green-200 border border-green-500/50">
                ✓ Live
              </span>
            )}
            {currentJourney && (
              <span className="text-xs text-gray-500">
                {currentJourney.steps.length} step{currentJourney.steps.length !== 1 ? "s" : ""}
              </span>
            )}
            <div className="flex-1" />
            <button
              onClick={saveCurrentJourney}
              disabled={saving || !currentJourney}
              className="px-4 py-2 text-xs font-semibold bg-green-500/20 text-green-300 border border-green-500/30 rounded-lg hover:bg-green-500/40 hover:border-green-500/60 hover:shadow-lg hover:scale-105 transition-all disabled:opacity-50 cursor-pointer"
            >
              {saving ? "Saving…" : "Save"}
            </button>

            <button
              onClick={undo}
              disabled={!canUndo}
              className="px-4 py-2 text-xs font-semibold bg-gray-500/20 text-gray-300 border border-gray-500/30 rounded-lg hover:bg-gray-500/30 transition-all disabled:opacity-40 cursor-pointer"
              title="Undo (⌘Z)"
            >
              ↶ Undo
            </button>

            <button
              onClick={redo}
              disabled={!canRedo}
              className="px-4 py-2 text-xs font-semibold bg-gray-500/20 text-gray-300 border border-gray-500/30 rounded-lg hover:bg-gray-500/30 transition-all disabled:opacity-40 cursor-pointer"
              title="Redo (⌘⇧Z)"
            >
              ↷ Redo
            </button>
          </div>
        </div>

        {/* Layout: [Builder] | [Variables] (panels hidden in editor mode) */}
        <div className="flex-1 flex overflow-x-auto overflow-y-hidden">
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
