import getDb from "./db";
import { TreeNode, ChatbotEvent } from "./types";
import { classifyEventToTreeNode, getTreeLeaves, getTreeNodePath } from "./tree-evaluator";

/**
 * Get published tree from database
 */
export function getPublishedTree(): TreeNode | null {
  const db = getDb();
  const tree = db
    .prepare("SELECT structure FROM tree_configs WHERE status = 'published' LIMIT 1")
    .get() as { structure: string } | undefined;

  if (!tree) return null;

  try {
    return JSON.parse(tree.structure);
  } catch {
    return null;
  }
}

/**
 * Classify events into tree leaves
 * Returns map of leaf node path -> events
 */
export function classifyEventsToTreeLeaves(
  events: ChatbotEvent[],
  tree: TreeNode
): Map<string, ChatbotEvent[]> {
  const leaves = getTreeLeaves(tree);
  const result = new Map<string, ChatbotEvent[]>();

  // Initialize map with all leaves
  for (const leaf of leaves) {
    const path = getTreeNodePath(leaf, tree);
    result.set(path, []);
  }

  // Classify each event
  for (const event of events) {
    const leafNode = classifyEventToTreeNode(event, tree);
    if (leafNode) {
      const path = getTreeNodePath(leafNode, tree);
      const existing = result.get(path) || [];
      result.set(path, [...existing, event]);
    }
  }

  return result;
}

/**
 * Get distinct user count for events
 */
export function getUniqueUserCount(events: ChatbotEvent[]): number {
  const users = new Set(events.map((e) => e.userId));
  return users.size;
}

/**
 * Get completion rate: events with last step / total distinct users
 */
export function getCompletionRate(
  events: ChatbotEvent[],
  expectedLastStep: string
): number {
  if (events.length === 0) return 0;

  const usersWithCompletion = new Set<string>();

  for (const event of events) {
    if (event.step === expectedLastStep) {
      usersWithCompletion.add(event.userId);
    }
  }

  const totalUsers = new Set(events.map((e) => e.userId)).size;
  return totalUsers === 0 ? 0 : (usersWithCompletion.size / totalUsers) * 100;
}

/**
 * Get drop-off rate
 */
export function getDropoffRate(completionRate: number): number {
  return 100 - completionRate;
}

/**
 * Get step distribution for funnel
 * Counts events at each step
 */
export function getStepDistribution(
  events: ChatbotEvent[]
): Map<string, number> {
  const distribution = new Map<string, number>();

  for (const event of events) {
    const count = distribution.get(event.step) || 0;
    distribution.set(event.step, count + 1);
  }

  return distribution;
}

/**
 * Get event count by hour-of-day
 */
export function getEventsByHour(events: ChatbotEvent[]): Map<number, number> {
  const byHour = new Map<number, number>();

  for (let h = 0; h < 24; h++) {
    byHour.set(h, 0);
  }

  for (const event of events) {
    const date = new Date(event.timestamp);
    const hour = date.getHours();
    const count = byHour.get(hour) || 0;
    byHour.set(hour, count + 1);
  }

  return byHour;
}

/**
 * Get event count by day-of-week
 * 0 = Sunday, 6 = Saturday
 */
export function getEventsByDayOfWeek(events: ChatbotEvent[]): Map<number, number> {
  const byDay = new Map<number, number>();

  for (let d = 0; d < 7; d++) {
    byDay.set(d, 0);
  }

  for (const event of events) {
    const date = new Date(event.timestamp);
    const day = date.getDay();
    const count = byDay.get(day) || 0;
    byDay.set(day, count + 1);
  }

  return byDay;
}

/**
 * Get heatmap data (day × hour)
 */
export function getHeatmapData(
  events: ChatbotEvent[]
): Array<{ day: number; hour: number; count: number }> {
  const heatmap = new Map<string, number>();

  for (const event of events) {
    const date = new Date(event.timestamp);
    const day = date.getDay();
    const hour = date.getHours();
    const key = `${day}-${hour}`;
    const count = heatmap.get(key) || 0;
    heatmap.set(key, count + 1);
  }

  const result: Array<{ day: number; hour: number; count: number }> = [];
  for (const [key, count] of heatmap.entries()) {
    const [day, hour] = key.split("-").map(Number);
    result.push({ day, hour, count });
  }

  return result;
}

/**
 * Get user journey details
 */
export function getUserJourneys(
  events: ChatbotEvent[]
): Map<string, { steps: string[]; lastStep: string; timestamps: string[] }> {
  const journeys = new Map<string, { steps: string[]; lastStep: string; timestamps: string[] }>();

  for (const event of events) {
    const existing = journeys.get(event.userId) || {
      steps: [],
      lastStep: "",
      timestamps: [],
    };

    if (!existing.steps.includes(event.step)) {
      existing.steps.push(event.step);
    }
    existing.lastStep = event.step;
    existing.timestamps.push(event.timestamp);

    journeys.set(event.userId, existing);
  }

  return journeys;
}

/**
 * Check if a user completed journey (reached expected last step)
 */
export function isJourneyCompleted(
  userEvents: ChatbotEvent[],
  expectedLastStep: string
): boolean {
  return userEvents.some((e) => e.step === expectedLastStep);
}
