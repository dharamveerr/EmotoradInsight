"use client";

import { useState, useRef, useEffect } from "react";
import { Journey, JourneyStep, JourneyOption, Variable } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";

/** Read selected variable IDs from an option, supporting the legacy single field. */
function getOptionVariableIds(option: JourneyOption): string[] {
  if (option.storesInVariables && option.storesInVariables.length > 0) {
    return option.storesInVariables;
  }
  return option.storesInVariable ? [option.storesInVariable] : [];
}

interface JourneyBuilderProps {
  journey: Journey | null;
  variables: Variable[];
  draggedVariable: string | null;
  onJourneyChange: (journey: Journey) => void;
}

function OptionRow({
  option,
  stepId,
  level,
  variables,
  clipboard,
  onCopyVars,
  onPasteVars,
  onUpdateOption,
  onDeleteOption,
}: {
  option: JourneyOption;
  stepId: string;
  level: number;
  variables: Variable[];
  clipboard: string[];
  onCopyVars: (ids: string[]) => void;
  onPasteVars: (stepId: string, optionId: string) => void;
  onUpdateOption: (stepId: string, optionId: string, updates: Partial<JourneyOption>) => void;
  onDeleteOption: (stepId: string, optionId: string) => void;
}) {
  const selectedIds = getOptionVariableIds(option);
  const selectedVars = selectedIds
    .map((id) => variables.find((v) => v.id === id))
    .filter((v): v is Variable => Boolean(v));
  const availableVars = variables.filter((v) => !selectedIds.includes(v.id));

  // Searchable picker state
  const [search, setSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const pickerRef = useRef<HTMLDivElement>(null);

  const q = search.trim().toLowerCase();
  const filteredVars = q
    ? availableVars.filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          (v.description || "").toLowerCase().includes(q)
      )
    : availableVars;

  // Close on outside click
  useEffect(() => {
    if (!pickerOpen) return;
    function handler(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [pickerOpen]);

  // Reset highlight when filter changes
  useEffect(() => {
    setHighlightIdx(0);
  }, [search, pickerOpen]);

  function setVariables(ids: string[]) {
    onUpdateOption(stepId, option.id, {
      storesInVariables: ids,
      storesInVariable: ids[0] || "", // keep legacy field synced to first
    });
  }

  function addVariable(id: string) {
    if (!id || selectedIds.includes(id)) return;
    setVariables([...selectedIds, id]);
    setSearch("");
    // Keep picker open so user can add more quickly
  }

  function removeVariable(id: string) {
    setVariables(selectedIds.filter((v) => v !== id));
  }

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, filteredVars.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = filteredVars[highlightIdx];
      if (pick) addVariable(pick.id);
    } else if (e.key === "Escape") {
      setPickerOpen(false);
      setSearch("");
    }
  }

  return (
    <div
      className="flex items-start gap-2 px-3 py-2 hover:bg-white/5 rounded group"
      style={{ marginLeft: `${level * 24}px` }}
    >
      <span className="text-gray-500 mt-1.5">↳</span>

      <input
        type="text"
        value={option.label}
        onChange={(e) => onUpdateOption(stepId, option.id, { label: e.target.value })}
        placeholder="Option label…"
        className="flex-1 bg-white/10 border border-white/10 rounded px-2 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
      />

      {/* Multi-variable selector */}
      <div className="flex flex-col gap-1.5 w-56 shrink-0">
        {/* Selected variable chips */}
        {selectedVars.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {selectedVars.map((v) => (
              <span
                key={v.id}
                className="inline-flex items-center gap-1 bg-blue-500/20 border border-blue-500/30 text-blue-200 rounded px-1.5 py-0.5 text-xs font-medium"
              >
                {v.name}
                <button
                  onClick={() => removeVariable(v.id)}
                  className="text-blue-300 hover:text-red-300 transition-colors leading-none"
                  title="Remove variable"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Searchable add-variable picker */}
        <div ref={pickerRef} className="relative">
          <input
            type="text"
            value={search}
            onFocus={() => setPickerOpen(true)}
            onChange={(e) => {
              setSearch(e.target.value);
              setPickerOpen(true);
            }}
            onKeyDown={onSearchKeyDown}
            disabled={availableVars.length === 0}
            placeholder={
              availableVars.length === 0
                ? "All variables added"
                : selectedVars.length === 0
                ? "Search variable(s)…"
                : "+ Add another variable"
            }
            className="w-full bg-white/10 border border-white/10 rounded px-2 py-1 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500/40 disabled:opacity-40"
          />

          {pickerOpen && availableVars.length > 0 && (
            <ul
              className="absolute z-50 mt-1 left-0 right-0 max-h-56 overflow-y-auto rounded border border-blue-500/30 shadow-2xl"
              style={{
                background: "rgba(10, 20, 40, 0.97)",
                backdropFilter: "blur(16px)",
              }}
            >
              {filteredVars.length === 0 ? (
                <li className="px-3 py-2 text-xs text-gray-500">No matches</li>
              ) : (
                filteredVars.map((v, i) => (
                  <li
                    key={v.id}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      addVariable(v.id);
                    }}
                    onMouseEnter={() => setHighlightIdx(i)}
                    className={`px-3 py-1.5 text-xs cursor-pointer flex flex-col gap-0.5 ${
                      i === highlightIdx
                        ? "bg-blue-500/20 text-blue-200"
                        : "text-gray-300 hover:bg-white/5"
                    }`}
                  >
                    <span className="font-mono">{v.name}</span>
                    {v.description && (
                      <span className="text-gray-500 text-[10px] truncate">
                        {v.description}
                      </span>
                    )}
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      </div>

      <div className="flex gap-1 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onCopyVars(selectedIds)}
          disabled={selectedIds.length === 0}
          className="text-xs px-2 py-1 bg-blue-500/20 text-blue-300 rounded hover:bg-blue-500/30 transition-colors disabled:opacity-30 whitespace-nowrap"
          title="Copy this option's variables"
        >
          ⧉ Copy
        </button>
        <button
          onClick={() => onPasteVars(stepId, option.id)}
          disabled={clipboard.length === 0}
          className="text-xs px-2 py-1 bg-green-500/20 text-green-300 rounded hover:bg-green-500/30 transition-colors disabled:opacity-30 whitespace-nowrap"
          title={clipboard.length ? `Paste ${clipboard.length} variable(s)` : "Copy variables first"}
        >
          ⤓ Paste
        </button>
        <button
          onClick={() => onDeleteOption(stepId, option.id)}
          className="text-xs px-2 py-1 bg-red-500/20 text-red-300 rounded hover:bg-red-500/30 transition-colors"
          title="Delete option"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function StepRow({
  step,
  level,
  variables,
  clipboard,
  onCopyVars,
  onPasteVars,
  onUpdateStep,
  onDeleteStep,
  onAddOption,
  onUpdateOption,
  onDeleteOption,
  onAddChildStep,
}: {
  step: JourneyStep;
  level: number;
  variables: Variable[];
  clipboard: string[];
  onCopyVars: (ids: string[]) => void;
  onPasteVars: (stepId: string, optionId: string) => void;
  onUpdateStep: (stepId: string, updates: Partial<JourneyStep>) => void;
  onDeleteStep: (stepId: string) => void;
  onAddOption: (stepId: string) => void;
  onUpdateOption: (stepId: string, optionId: string, updates: Partial<JourneyOption>) => void;
  onDeleteOption: (stepId: string, optionId: string) => void;
  onAddChildStep: (parentId: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const children = step.children || [];
  const hasChildren = children.length > 0;
  const hasContent = hasChildren || step.options.length > 0;

  return (
    <div>
      <div
        className="flex items-center gap-2 px-3 py-2 hover:bg-white/5 rounded group"
        style={{ marginLeft: `${level * 24}px` }}
      >
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-gray-500 hover:text-gray-300 w-4 text-center"
          title={expanded ? "Collapse" : "Expand"}
        >
          {hasContent ? (expanded ? "▼" : "▶") : "•"}
        </button>

        <input
          type="text"
          value={step.name}
          onChange={(e) => onUpdateStep(step.id, { name: e.target.value })}
          placeholder="Step name…"
          className="flex-1 bg-white/10 border border-white/10 rounded px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
        />

        <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-semibold whitespace-nowrap">
          {step.options.length} opt
          {hasChildren ? ` · ${children.length} sub` : ""}
        </span>

        <button
          onClick={() => onAddOption(step.id)}
          className="text-xs px-2 py-1 bg-green-500/20 text-green-300 rounded hover:bg-green-500/30 transition-colors opacity-0 group-hover:opacity-100 whitespace-nowrap"
          title="Add option to this step"
        >
          + Option
        </button>

        <button
          onClick={() => onAddChildStep(step.id)}
          className="text-xs px-2 py-1 bg-purple-500/20 text-purple-300 rounded hover:bg-purple-500/30 transition-colors opacity-0 group-hover:opacity-100 whitespace-nowrap"
          title="Add child step (nested under this step)"
        >
          + Step
        </button>

        <button
          onClick={() => onDeleteStep(step.id)}
          className="text-xs px-2 py-1 bg-red-500/20 text-red-300 rounded hover:bg-red-500/30 transition-colors opacity-0 group-hover:opacity-100"
          title="Delete step"
        >
          ✕
        </button>
      </div>

      {expanded && step.options.length > 0 && (
        <div>
          {step.options.map((option) => (
            <OptionRow
              key={option.id}
              option={option}
              stepId={step.id}
              level={level + 1}
              variables={variables}
              clipboard={clipboard}
              onCopyVars={onCopyVars}
              onPasteVars={onPasteVars}
              onUpdateOption={onUpdateOption}
              onDeleteOption={onDeleteOption}
            />
          ))}
        </div>
      )}

      {/* Nested child steps — recursive render */}
      {expanded && hasChildren && (
        <div
          className="border-l border-purple-500/20 ml-3"
          style={{ marginLeft: `${level * 24 + 12}px` }}
        >
          {children.map((child) => (
            <StepRow
              key={child.id}
              step={child}
              level={level + 1}
              variables={variables}
              clipboard={clipboard}
              onCopyVars={onCopyVars}
              onPasteVars={onPasteVars}
              onUpdateStep={onUpdateStep}
              onDeleteStep={onDeleteStep}
              onAddOption={onAddOption}
              onUpdateOption={onUpdateOption}
              onDeleteOption={onDeleteOption}
              onAddChildStep={onAddChildStep}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function JourneyBuilder({
  journey,
  variables,
  draggedVariable,
  onJourneyChange,
}: JourneyBuilderProps) {
  // ── Recursive tree helpers ─────────────────────────────────────
  // Walk every step in the tree and apply `mapFn` if it matches `id`.
  const mapStepTree = (
    steps: JourneyStep[],
    id: string,
    mapFn: (s: JourneyStep) => JourneyStep
  ): JourneyStep[] =>
    steps.map((s) => {
      const updated = s.id === id ? mapFn(s) : s;
      return updated.children
        ? { ...updated, children: mapStepTree(updated.children, id, mapFn) }
        : updated;
    });

  const filterStepTree = (steps: JourneyStep[], id: string): JourneyStep[] =>
    steps
      .filter((s) => s.id !== id)
      .map((s) =>
        s.children ? { ...s, children: filterStepTree(s.children, id) } : s
      );

  const updateStepInJourney = (
    j: Journey,
    stepId: string,
    updates: Partial<JourneyStep>
  ): Journey => ({
    ...j,
    steps: mapStepTree(j.steps, stepId, (s) => ({ ...s, ...updates })),
  });

  const deleteStepFromJourney = (j: Journey, stepId: string): Journey => ({
    ...j,
    steps: filterStepTree(j.steps, stepId),
  });

  const addOptionToStep = (j: Journey, stepId: string): Journey => ({
    ...j,
    steps: mapStepTree(j.steps, stepId, (s) => ({
      ...s,
      options: [
        ...s.options,
        { id: uuidv4(), label: "New Option", storesInVariables: [] },
      ],
    })),
  });

  const updateOptionInStep = (
    j: Journey,
    stepId: string,
    optionId: string,
    updates: Partial<JourneyOption>
  ): Journey => ({
    ...j,
    steps: mapStepTree(j.steps, stepId, (s) => ({
      ...s,
      options: s.options.map((opt) =>
        opt.id === optionId ? { ...opt, ...updates } : opt
      ),
    })),
  });

  const deleteOptionFromStep = (
    j: Journey,
    stepId: string,
    optionId: string
  ): Journey => ({
    ...j,
    steps: mapStepTree(j.steps, stepId, (s) => ({
      ...s,
      options: s.options.filter((opt) => opt.id !== optionId),
    })),
  });

  // Copy/paste variable sets between options. Paste merges (no dupes).
  const [varClipboard, setVarClipboard] = useState<string[]>([]);

  const pasteVarsToOption = (
    j: Journey,
    stepId: string,
    optionId: string
  ): Journey => ({
    ...j,
    steps: mapStepTree(j.steps, stepId, (s) => ({
      ...s,
      options: s.options.map((opt) => {
        if (opt.id !== optionId) return opt;
        const current = getOptionVariableIds(opt);
        const merged = [...new Set([...current, ...varClipboard])];
        return { ...opt, storesInVariables: merged, storesInVariable: merged[0] || "" };
      }),
    })),
  });

  const addChildStepToParent = (j: Journey, parentId: string): Journey => {
    const newChild: JourneyStep = {
      id: uuidv4(),
      name: "New Sub-step",
      options: [],
      children: [],
    };
    return {
      ...j,
      steps: mapStepTree(j.steps, parentId, (s) => ({
        ...s,
        children: [...(s.children || []), newChild],
      })),
    };
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add("bg-blue-500/10");
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove("bg-blue-500/10");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove("bg-blue-500/10");

    if (!journey) return;

    const variableId = e.dataTransfer?.getData("variable");
    if (!variableId) return;

    const newStep: JourneyStep = {
      id: uuidv4(),
      name: `Step ${journey.steps.length + 1}`,
      options: [
        {
          id: uuidv4(),
          label: "Option 1",
          storesInVariables: [variableId],
          storesInVariable: variableId,
        },
      ],
    };

    const updated = {
      ...journey,
      steps: [...journey.steps, newStep],
    };

    onJourneyChange(updated);
  };

  if (!journey) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        Create or select a journey to get started
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-auto bg-white/3">
      {/* Header */}
      <div className="p-4 border-b border-white/10 shrink-0">
        <h3 className="text-sm font-bold text-white">{journey.name || "Untitled Journey"}</h3>
        <p className="text-xs text-gray-500 mt-1">
          Drag variables to add steps. {journey.steps.length} step(s)
        </p>
        {varClipboard.length > 0 && (
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-blue-300">
              📋 Copied {varClipboard.length} variable(s) — hover an option, click Paste
            </span>
            <button
              onClick={() => setVarClipboard([])}
              className="text-xs text-gray-500 hover:text-red-300"
              title="Clear clipboard"
            >
              clear
            </button>
          </div>
        )}
      </div>

      {/* Steps */}
      <div
        className="flex-1 p-4 overflow-y-auto transition-colors"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{ minHeight: "200px" }}
      >
        {journey.steps.length === 0 ? (
          <div className="text-xs text-gray-500 text-center py-8">
            Drag a variable here to create first step
          </div>
        ) : (
          journey.steps.map((step) => (
            <StepRow
              key={step.id}
              step={step}
              level={0}
              variables={variables}
              clipboard={varClipboard}
              onCopyVars={(ids) => setVarClipboard(ids)}
              onPasteVars={(stepId, optionId) => {
                onJourneyChange(pasteVarsToOption(journey, stepId, optionId));
              }}
              onUpdateStep={(stepId, updates) => {
                onJourneyChange(updateStepInJourney(journey, stepId, updates));
              }}
              onDeleteStep={(stepId) => {
                onJourneyChange(deleteStepFromJourney(journey, stepId));
              }}
              onAddOption={(stepId) => {
                onJourneyChange(addOptionToStep(journey, stepId));
              }}
              onUpdateOption={(stepId, optionId, updates) => {
                onJourneyChange(updateOptionInStep(journey, stepId, optionId, updates));
              }}
              onDeleteOption={(stepId, optionId) => {
                onJourneyChange(deleteOptionFromStep(journey, stepId, optionId));
              }}
              onAddChildStep={(parentId) => {
                onJourneyChange(addChildStepToParent(journey, parentId));
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}
