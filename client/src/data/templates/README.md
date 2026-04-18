# SentiArch Program Specification Data Schema

This directory contains the canonical data schema and template registry for the **Program Specification Editor** (Phase 1, Step 1 of the SentiArch parametric design workflow).

## Overview

The Program Specification is the foundation of the SentiArch pipeline. All downstream engines (zoning, stacking, massing, envelope, interior-layout) consume the `ProgramSpec` object defined here.

The schema is intentionally decoupled from any UI component to ensure it can be reviewed, validated, and versioned independently.

## Design Decisions

### 1. Undirected Adjacency Normalization

Adjacency relationships between spaces are inherently **undirected** (if Space A is adjacent to Space B, then Space B is adjacent to Space A).

To avoid duplicate key issues and simplify graph traversal in the zoning algorithm, we normalize all adjacency pairs so that `fromSpaceId < toSpaceId` using standard string comparison (`String.prototype.localeCompare`).

**Implementation:**
Always use the `createAdjacencyRule()` helper function when defining rules. It automatically sorts the IDs and guarantees the invariant.

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

- `floorMandatory` (optional `number`): A hard constraint. The space MUST be placed on exactly this floor number (0 = G/F). The solver will fail or penalize heavily if this is violated.
- `floorPreference` (soft enum: `'ground' | 'low' | 'mid' | 'high' | 'any'`): A soft hint. The zoning algorithm should first satisfy any hard constraints, then optimize for this preference.

### 3. Horizontal Clustering (`clusterGroup`)

The `clusterGroup` property is a string tag used to indicate **same-floor preference** (horizontal clustering).

Spaces that share the same `clusterGroup` string (e.g., `"science"`, `"art"`) are preferred to be placed on the same floor plate.

**Important:** This is NOT vertical stacking. A separate `verticalStackGroup` property may be introduced in a future phase if vertical alignment constraints are required.

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

## Validation

All TypeScript interfaces are backed by [Zod](https://zod.dev/) schemas in `client/src/types/program.ts`. This ensures runtime type safety when loading templates from external sources or user uploads.

Use `validateProgramSpec(data)` to safely parse and validate unknown data against the schema.
