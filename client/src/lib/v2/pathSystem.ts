// ============================================================
// SentiArch v2 — Wayfinding Path System
// Ordered node list with activity/MET values
// ============================================================

import type { SpaceTag } from "./spaceTags";

/** Occupancy density level — affects LLM narrative */
export type OccupancyLevel = "empty" | "normal" | "crowded";

/** Available activities and their MET values */
export interface ActivityDef {
  id: string;
  label: string;
  met: number;
}

export const ACTIVITIES: ActivityDef[] = [
  { id: "resting",            label: "Resting",             met: 1.0 },
  { id: "studying",           label: "Studying",            met: 1.0 },
  { id: "viewing_scenery",    label: "Viewing Scenery",     met: 1.0 },
  { id: "attending_class",    label: "Attending Class",     met: 1.2 },
  { id: "eating",             label: "Eating",              met: 1.2 },
  { id: "socialising",        label: "Socialising",         met: 1.2 },
  { id: "creating_art",       label: "Creating Art",        met: 1.4 },
  { id: "playing_music",      label: "Playing Music",       met: 1.4 },
  { id: "walking",            label: "Walking",             met: 2.0 },
  { id: "climbing_stairs",    label: "Climbing Stairs",     met: 2.0 },
  { id: "exercising",         label: "Exercising",          met: 3.0 },
  { id: "playing_basketball", label: "Playing Basketball",  met: 3.0 },
];

/** Node mode: passing through or dwelling */
export type NodeMode = "passing_through" | "dwelling";

/**
 * A single space node in the wayfinding path.
 * Full address: Zone / Floor / Program
 */
export interface PathNode {
  id: string;
  /** Full space address, e.g., "Senior Secondary / 4F / Computer Room" */
  zone: string;
  floor: string;
  program: string;
  /** Space type tag — determines environmental resolution */
  spaceTag: SpaceTag;
  /** Passing through or dwelling */
  mode: NodeMode;
  /** Activity — required when mode is "dwelling" */
  activityId?: string;
  /** Duration in minutes — required when mode is "dwelling" */
  duration_minutes?: number;
}

/**
 * A complete simulation path definition.
 */
export interface SimulationPath {
  id: string;
  label: string;
  nodes: PathNode[];
}

// ---- Helpers ----

export function getActivityById(id: string): ActivityDef | undefined {
  return ACTIVITIES.find(a => a.id === id);
}

export function getMetForActivity(activityId: string): number {
  const activity = getActivityById(activityId);
  return activity?.met ?? 1.2; // default to light activity
}

/**
 * Check if a program name indicates a vertical transition space.
 * Keywords: staircase, lift, escalator, ramp
 */
export function isVerticalTransition(programName: string): boolean {
  const lower = programName.toLowerCase();
  return (
    lower.includes("staircase") ||
    lower.includes("stair") ||
    lower.includes("lift") ||
    lower.includes("elevator") ||
    lower.includes("escalator") ||
    lower.includes("ramp")
  );
}

/**
 * Get the full address string for a path node.
 */
export function getNodeAddress(node: PathNode): string {
  return `${node.zone} / ${node.floor} / ${node.program}`;
}

/**
 * Create a default path node.
 */
export function createDefaultNode(index: number): PathNode {
  return {
    id: `node_${Date.now()}_${index}`,
    zone: "",
    floor: "",
    program: "",
    spaceTag: "indoor_ac",
    mode: "dwelling",
    activityId: "attending_class",
    duration_minutes: 30,
  };
}
