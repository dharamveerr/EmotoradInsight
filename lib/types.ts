export type ChatbotEvent = {
  id: string;
  userId: string;
  journey: string;
  step: string;
  timestamp: string;
  metadata?: string; // JSON string
};

export type Journey =
  | "explore_products"
  | "register_warranty"
  | "customer_support"
  | "track_order"
  | "find_shop";

export const JOURNEY_LABELS: Record<string, string> = {
  explore_products: "Explore EM Products",
  register_warranty: "Register Warranty",
  customer_support: "Contact Customer Support",
  track_order: "Track Your Order",
  find_shop: "Find Shop/Service Centre",
};

export const JOURNEY_STEPS: Record<string, string[]> = {
  explore_products: [
    "Explore EM Products",
    "Product Selected",
    "Price Filter Set",
  ],
  register_warranty: [
    "Register Warranty",
    "Frame Number Entered",
    "Warranty Checked",
    "Warranty Registered",
  ],
  customer_support: [
    "Contact Customer Support",
    "Issue Type Selected",
    "Issue Details Provided",
    "Ticket Created",
  ],
  track_order: [
    "Track Your Order",
    "Order ID Entered",
    "Order Found",
    "Order Status Viewed",
  ],
  find_shop: [
    "Find Shop/Service Centre",
    "Location Entered",
    "Shops Displayed",
  ],
};

export type InsightStats = {
  totalSessions: number;
  activeJourneys: number;
  completionRate: number;
  dropoffRate: number;
};

export type JourneyCount = {
  journey: string;
  count: number;
};

export type HeatmapCell = {
  day: number;  // 0=Sun, 6=Sat
  hour: number; // 0-23
  count: number;
};

export type StepStat = {
  step: string;
  entered: number;
  exited: number;
  dropRate: number;
};

export type Session = {
  userId: string;
  journey: string;
  startTime: string;
  stepsCompleted: number;
  totalSteps: number;
  outcome: "completed" | "dropped";
  steps: { step: string; timestamp: string }[];
};

export type TreeCondition = {
  variable: string;
  operator: "equals" | "contains" | "startsWith" | "range";
  value: string | number | [number, number]; // string for equals/contains/startsWith, [min, max] for range
};

export type TreeNode = {
  id: string;
  name: string;
  type: "category" | "leaf";
  conditions?: TreeCondition[];
  children?: TreeNode[];
};

export type TreeConfig = {
  id: string;
  name: string;
  description?: string;
  structure: TreeNode;
  status: "draft" | "published";
  published_at?: string;
  created_at: string;
  updated_at: string;
};

export type Variable = {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
};

export type JourneyOption = {
  id: string;
  label: string;
  storesInVariable: string;
};

export type JourneyStep = {
  id: string;
  name: string;
  options: JourneyOption[];
};

export type Journey = {
  id: string;
  name: string;
  description?: string;
  steps: JourneyStep[];
  status: "draft" | "published";
  published_at?: string;
  created_at: string;
  updated_at: string;
};
