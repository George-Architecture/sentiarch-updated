# SentiArch Program Specification Data Schema

This directory contains the canonical data schema and template registry for the **Program Specification Editor** (Phase 1, Step 1 of the SentiArch parametric design workflow).

## Overview

The Program Specification is the foundation of the SentiArch pipeline. All downstream engines (zoning, stacking, massing, envelope, interior-layout) consume the `ProgramSpec` object defined here.

The schema is intentionally decoupled from any UI component to ensure it can be reviewed, validated, and versioned independently.

## Design Decisions

### 1. Undirected Adjacency Normalization

Adjacency relationships between spaces are inherently **undirected** (if Space A is adjacent to Space B, then Space B is adjacent to Space A).

To avoid duplicate key issues and simplify graph traversal in the zoning algorithm, we normalize all adjacency pairs so that `fromSpaceId < toSpaceId` using standard string comparison (`String.prototype.localeCompare`). This invariant is enforced at two levels: the `createAdjacencyRule()` helper auto-sorts the pair, and the `AdjacencyRuleSchema` Zod refinement rejects any rule where the ordering is violated.

```typescript
import { createAdjacencyRule } from "@/types/program";

const rule = createAdjacencyRule({
  id: "adj-01",
  fromSpaceId: "chem-lab",
  toSpaceId: "bio-lab",
  type: "should_adjacent",
  weight: 0.8,
});
// rule.fromSpaceId === "bio-lab"
// rule.toSpaceId   === "chem-lab"
```

### 2. Floor Preferences vs. Mandatory Constraints

The schema distinguishes between soft preferences and hard constraints for vertical placement:

- `floorMandatory` (optional `number`): A hard constraint. The space MUST be placed on exactly this floor number (0 = G/F). The solver will fail or penalize heavily if this is violated. Must be `< constraints.maxFloors` (0-indexed).
- `floorPreference` (soft enum: `'ground' | 'low' | 'mid' | 'high' | 'any'`): A soft hint. The zoning algorithm should first satisfy any hard constraints, then optimize for this preference.

### 3. Category (Hard Classification) vs. clusterGroup (Soft Zoning Hint)

These two fields serve fundamentally different purposes and should not be confused:

**`category`** is a **hard classification**. Every space belongs to exactly one category (e.g. `"academic"`, `"art"`, `"science"`). It is used for colour-coding in the 3-D viewer and as a coarse filter in the zoning algorithm. Category membership is fixed and defines *what a space is*.

**`clusterGroup`** is a **soft zoning hint**. It is an optional, free-form string tag that tells the solver which spaces are *preferred to be placed on the same floor* (horizontal clustering). Unlike `category`, a space's `clusterGroup` can differ from its category. For example, a `"support"` category space like a laundry room might have `clusterGroup: "residential"` because it should be co-located with the dormitory on the same floor.

Key differences:

- `category` is required and constrained to a fixed enum; `clusterGroup` is optional and free-form.
- `category` drives visualization and filtering; `clusterGroup` drives the solver's floor-assignment optimization.
- A space may share a `clusterGroup` with spaces from a completely different `category`.

**Important:** `clusterGroup` expresses **horizontal** (same-floor) clustering only. This is NOT vertical stacking. A separate `verticalStackGroup` property may be introduced in a future phase if vertical alignment constraints are required.

### 4. Adjacency Weight Semantics

The `weight` field on `AdjacencyRule` ranges from `0.01` to `1.0`:

- `1.0` indicates maximum priority (hard constraint).
- Values closer to `0` indicate lower priority.
- `0` is **not allowed** — a weight of zero would mean the rule has no effect. If a rule is not needed, remove it from the adjacencies array instead of setting weight to zero.

### 5. Schema Versioning

Every `ProgramSpec` includes a `schemaVersion` field (currently `"1.0.0"`). This provides a foundation for future data migration when the schema evolves.

## Adding a New Template

The template system is designed to be plugin-ready. To add a new template (e.g., for a primary school or office building):

1. Create a new TypeScript file in `client/src/data/templates/` (e.g., `primary.ts`).
2. Define your spaces, adjacencies, and constraints following the `ProgramSpec` schema.
3. Export the assembled `ProgramSpec` object.
4. Open `client/src/data/templates/index.ts` and register your template:

```typescript
import { myNewTemplate } from "./primary";

registerTemplate(myNewTemplate, "primary_school");
```

The template will now be available via `listTemplates()` and `getTemplate()`.

## JCTIC Template Notes

The JCTIC (賽馬會體藝中學) template has `floorMandatory` set on **all** spaces. This is intentional — it serves as a **reproducibility baseline** that faithfully reproduces the actual JCTIC floor distribution.

Designers conducting option studies should **clone the template** and then **selectively remove `floorMandatory`** from spaces they wish to explore alternative zonings for. For example, removing `floorMandatory` from the science cluster while keeping it on the sports facilities would allow the solver to explore different floor assignments for labs while anchoring the gymnasium to the ground floor.

Note that `art-sculpture` (雕塑工作室) does **not** have a `clusterGroup` despite being an art-category space. This reflects the actual JCTIC layout where the sculpture studio is independently located on 1/F, separate from the main art cluster on 2/F.

## Validation

All TypeScript interfaces are backed by [Zod](https://zod.dev/) schemas in `client/src/types/program.ts`. This ensures runtime type safety when loading templates from external sources or user uploads. The schemas include refinements that enforce:

- Unique IDs across spaces and adjacencies
- Cross-reference integrity (adjacency space IDs must exist in the spaces array)
- Area range consistency (`minArea ≤ areaPerUnit ≤ maxArea`)
- Floor constraint consistency (`floorMandatory < maxFloors`)
- Building height feasibility (`maxFloors × floorHeight ≤ maxBuildingHeightM`)
- Adjacency normalization (`fromSpaceId < toSpaceId`)
- No self-loops in adjacency rules

Use `validateProgramSpec(data)` to safely parse and validate unknown data against the full schema.
