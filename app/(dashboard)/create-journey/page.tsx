"use client";

import { useState, useEffect } from "react";
import Topbar from "@/components/Topbar";
import JourneyList from "@/components/JourneyList";
import JourneyBuilder from "@/components/JourneyBuilder";
import VariableManager from "@/components/VariableManager";
import { Journey, Variable, JourneyStep } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";

export default function CreateJourneyPage() {
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [variables, setVariables] = useState<Variable[]>([]);
  const [selectedJourneyId, setSelectedJourneyId] = useState<string | null>(null);
  const [currentJourney, setCurrentJourney] = useState<Journey | null>(null);
  const [draggedVariable, setDraggedVariable] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [journeyName, setJourneyName] = useState("");

  // Load journeys and variables on mount
  useEffect(() => {
    fetchJourneys();
    fetchVariables();
  }, []);

  async function fetchJourneys() {
    const res = await fetch("/api/journeys");
    const data = await res.json();
    setJourneys(data.journeys || []);
  }

  async function fetchVariables() {
    const res = await fetch("/api/variables");
    const data = await res.json();
    setVariables(data.variables || []);
  }

  function createNewJourney() {
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
  }

  async function loadJourney(id: string) {
    try {
      setSelectedJourneyId(id);
      console.log("Loading journey:", id);

      const res = await fetch(`/api/journeys/${id}`);
      console.log("Response status:", res.status);

      if (!res.ok) {
        const errData = await res.json();
        console.error("API Error:", errData);
        alert(`Failed to load journey: ${errData.error || res.statusText}`);
        return;
      }

      const data = await res.json();
      console.log("Journey data:", data);

      const journeyData = data.journey;

      if (!journeyData) {
        console.error("No journey data in response");
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
      console.log("Setting current journey:", fullJourney);
      setCurrentJourney(fullJourney);
    } catch (error) {
      console.error("Error loading journey:", error);
      alert(`Error loading journey: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function saveCurrentJourney() {
    if (!currentJourney || !journeyName) {
      alert("Journey name required");
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
            name: journeyName,
            description: currentJourney.description,
            steps: currentJourney.steps,
          }),
        });
        if (res.ok) {
          await fetchJourneys();
          alert("Journey updated");
        }
      } else {
        // Create new
        const res = await fetch("/api/journeys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: journeyName,
            description: currentJourney.description,
            steps: currentJourney.steps,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setSelectedJourneyId(data.id);
          await fetchJourneys();
          alert("Journey saved");
        }
      }
    } finally {
      setSaving(false);
    }
  }

  async function publishJourney(id: string) {
    const res = await fetch(`/api/journeys/${id}/publish`, {
      method: "POST",
    });
    if (res.ok) {
      await fetchJourneys();
      alert("Journey published!");
    }
  }

  async function deleteJourney(id: string) {
    const res = await fetch("/api/journeys", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      await fetchJourneys();
      setCurrentJourney(null);
      setSelectedJourneyId(null);
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Topbar title="Create Journey" subtitle="Build customer journey flows with variables" />

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Journey name input + controls */}
        <div className="flex items-center gap-3 px-7 py-4 border-b border-white/10 bg-white/3">
          <input
            type="text"
            value={journeyName}
            onChange={(e) => setJourneyName(e.target.value)}
            placeholder="Journey name…"
            className="glass rounded-lg px-4 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500/40 flex-1"
          />

          <button
            onClick={createNewJourney}
            className="px-4 py-2 text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg hover:bg-blue-500/30 transition-all"
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
            onClick={() => {
              if (currentJourney) {
                setCurrentJourney({
                  ...currentJourney,
                  steps: [],
                });
              }
            }}
            className="px-4 py-2 text-xs font-semibold bg-gray-500/20 text-gray-300 border border-gray-500/30 rounded-lg hover:bg-gray-500/30 transition-all"
          >
            Reset
          </button>
        </div>

        {/* Three-column layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Journey List */}
          <JourneyList
            selectedJourneyId={selectedJourneyId}
            onSelectJourney={loadJourney}
            onNewJourney={createNewJourney}
            onPublishJourney={publishJourney}
            onDeleteJourney={deleteJourney}
            onRefresh={fetchJourneys}
          />

          {/* Center: Journey Builder */}
          <JourneyBuilder
            journey={currentJourney}
            variables={variables}
            draggedVariable={draggedVariable}
            onJourneyChange={setCurrentJourney}
          />

          {/* Right: Variable Manager */}
          <VariableManager onDragStart={setDraggedVariable} />
        </div>
      </main>
    </div>
  );
}
