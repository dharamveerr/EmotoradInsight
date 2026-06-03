"use client";

import { useState } from "react";
import { Journey, JourneyStep, JourneyOption, Variable } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";

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
  onUpdateOption,
  onDeleteOption,
}: {
  option: JourneyOption;
  stepId: string;
  level: number;
  variables: Variable[];
  onUpdateOption: (stepId: string, optionId: string, updates: Partial<JourneyOption>) => void;
  onDeleteOption: (stepId: string, optionId: string) => void;
}) {
  const selectedVar = variables.find((v) => v.id === option.storesInVariable);

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 hover:bg-white/5 rounded group"
      style={{ marginLeft: `${level * 24}px` }}
    >
      <span className="text-gray-500">↳</span>

      <input
        type="text"
        value={option.label}
        onChange={(e) => onUpdateOption(stepId, option.id, { label: e.target.value })}
        placeholder="Option label…"
        className="flex-1 bg-white/10 border border-white/10 rounded px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
      />

      <select
        value={option.storesInVariable}
        onChange={(e) =>
          onUpdateOption(stepId, option.id, { storesInVariable: e.target.value })
        }
        className="bg-white/10 border border-white/10 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
      >
        <option value="">-- Select variable --</option>
        {variables.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </select>

      <button
        onClick={() => onDeleteOption(stepId, option.id)}
        className="text-xs px-2 py-1 bg-red-500/20 text-red-300 rounded hover:bg-red-500/30 transition-colors opacity-0 group-hover:opacity-100"
        title="Delete option"
      >
        ✕
      </button>
    </div>
  );
}

function StepRow({
  step,
  level,
  variables,
  onUpdateStep,
  onDeleteStep,
  onAddOption,
  onUpdateOption,
  onDeleteOption,
}: {
  step: JourneyStep;
  level: number;
  variables: Variable[];
  onUpdateStep: (stepId: string, updates: Partial<JourneyStep>) => void;
  onDeleteStep: (stepId: string) => void;
  onAddOption: (stepId: string) => void;
  onUpdateOption: (stepId: string, optionId: string, updates: Partial<JourneyOption>) => void;
  onDeleteOption: (stepId: string, optionId: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div>
      <div
        className="flex items-center gap-2 px-3 py-2 hover:bg-white/5 rounded group"
        style={{ marginLeft: `${level * 24}px` }}
      >
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-gray-500 hover:text-gray-300"
        >
          {expanded ? "▼" : "▶"}
        </button>

        <input
          type="text"
          value={step.name}
          onChange={(e) => onUpdateStep(step.id, { name: e.target.value })}
          placeholder="Step name…"
          className="flex-1 bg-white/10 border border-white/10 rounded px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
        />

        <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-semibold">
          {step.options.length} options
        </span>

        <button
          onClick={() => onAddOption(step.id)}
          className="text-xs px-2 py-1 bg-green-500/20 text-green-300 rounded hover:bg-green-500/30 transition-colors opacity-0 group-hover:opacity-100"
          title="Add option"
        >
          + Option
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
              onUpdateOption={onUpdateOption}
              onDeleteOption={onDeleteOption}
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
  const updateStepInJourney = (
    j: Journey,
    stepId: string,
    updates: Partial<JourneyStep>
  ): Journey => {
    return {
      ...j,
      steps: j.steps.map((step) =>
        step.id === stepId ? { ...step, ...updates } : step
      ),
    };
  };

  const deleteStepFromJourney = (j: Journey, stepId: string): Journey => {
    return {
      ...j,
      steps: j.steps.filter((s) => s.id !== stepId),
    };
  };

  const addOptionToStep = (j: Journey, stepId: string): Journey => {
    return {
      ...j,
      steps: j.steps.map((step) =>
        step.id === stepId
          ? {
              ...step,
              options: [
                ...step.options,
                {
                  id: uuidv4(),
                  label: "New Option",
                  storesInVariable: "",
                },
              ],
            }
          : step
      ),
    };
  };

  const updateOptionInStep = (
    j: Journey,
    stepId: string,
    optionId: string,
    updates: Partial<JourneyOption>
  ): Journey => {
    return {
      ...j,
      steps: j.steps.map((step) =>
        step.id === stepId
          ? {
              ...step,
              options: step.options.map((opt) =>
                opt.id === optionId ? { ...opt, ...updates } : opt
              ),
            }
          : step
      ),
    };
  };

  const deleteOptionFromStep = (
    j: Journey,
    stepId: string,
    optionId: string
  ): Journey => {
    return {
      ...j,
      steps: j.steps.map((step) =>
        step.id === stepId
          ? {
              ...step,
              options: step.options.filter((opt) => opt.id !== optionId),
            }
          : step
      ),
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
            />
          ))
        )}
      </div>
    </div>
  );
}
