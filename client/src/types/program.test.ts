// ============================================================
// SentiArch — Program Specification Schema Tests
//
// Verifies all Zod refinements catch the expected error cases:
//   #1  schemaVersion literal
//   #2  Cross-reference (adjacency → spaces)
//   #3  Duplicate IDs (spaces + adjacencies)
//   #4  Self-loop in adjacency
//   #5  Normalisation invariant (fromSpaceId < toSpaceId)
//   #6  areaPerUnit in [minArea, maxArea]
//   #7  floorMandatory < maxFloors
//   #8  maxFloors × floorHeight ≤ maxBuildingHeightM
//   #9  Kebab-case ID regex
//   #10 Weight min 0.01
//   #12 JCTIC art-sculpture has no clusterGroup
// ============================================================

import { describe, it, expect } from "vitest";
import {
  SpaceTypeSchema,
  AdjacencyRuleSchema,
  BuildingConstraintSchema,
  ProgramSpecSchema,
  createAdjacencyRule,
  validateProgramSpec,
  computeTotalArea,
  getAdjacenciesForSpace,
  PROGRAM_SPEC_SCHEMA_VERSION,
  type SpaceType,
  type AdjacencyRule,
  type BuildingConstraint,
} from "./program";
import { jcticTemplate } from "@/data/templates/jctic";

// ---- Test Helpers ----------------------------------------------------

/** Minimal valid space for composing test specs. */
function makeSpace(overrides: Partial<SpaceType> = {}): SpaceType {
  return {
    id: "test-space-a",
    name: "Test Space A",
    category: "academic",
    quantity: 1,
    areaPerUnit: 65,
    minArea: 55,
    maxArea: 75,
    occupancy: 30,
    requiredFeatures: [],
    floorPreference: "any",
    ...overrides,
  };
}

/** Minimal valid adjacency for composing test specs. */
function makeAdj(
  overrides: Partial<AdjacencyRule> = {}
): AdjacencyRule {
  return {
    id: "adj-test",
    fromSpaceId: "test-space-a",
    toSpaceId: "test-space-b",
    type: "should_adjacent",
    weight: 0.5,
    ...overrides,
  };
}

/** Minimal valid building constraint. */
function makeConstraints(
  overrides: Partial<BuildingConstraint> = {}
): BuildingConstraint {
  return {
    maxFloors: 6,
    floorHeight: 3.6,
    siteAreaM2: 10000,
    maxBuildingHeightM: 24,
    minCorridorWidthM: 1.5,
    ...overrides,
  };
}

/** Minimal valid ProgramSpec. */
function makeSpec(overrides: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  return {
    id: "test-spec",
    schemaVersion: PROGRAM_SPEC_SCHEMA_VERSION,
    name: "Test Spec",
    spaces: [
      makeSpace({ id: "test-space-a" }),
      makeSpace({ id: "test-space-b", name: "Test Space B" }),
    ],
    adjacencies: [makeAdj()],
    constraints: makeConstraints(),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ---- SpaceTypeSchema Tests -------------------------------------------

describe("SpaceTypeSchema", () => {
  it("accepts a valid space", () => {
    const result = SpaceTypeSchema.safeParse(makeSpace());
    expect(result.success).toBe(true);
  });

  // #9: kebab-case ID
  it("rejects non-kebab-case ID (uppercase)", () => {
    const result = SpaceTypeSchema.safeParse(
      makeSpace({ id: "Test_Space" })
    );
    expect(result.success).toBe(false);
  });

  it("rejects non-kebab-case ID (underscore)", () => {
    const result = SpaceTypeSchema.safeParse(
      makeSpace({ id: "test_space" })
    );
    expect(result.success).toBe(false);
  });

  // #6: areaPerUnit in [minArea, maxArea]
  it("rejects areaPerUnit < minArea", () => {
    const result = SpaceTypeSchema.safeParse(
      makeSpace({ areaPerUnit: 40, minArea: 55, maxArea: 75 })
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const msgs = result.error.issues.map(i => i.message);
      expect(msgs.some(m => m.includes("minArea"))).toBe(true);
    }
  });

  it("rejects areaPerUnit > maxArea", () => {
    const result = SpaceTypeSchema.safeParse(
      makeSpace({ areaPerUnit: 100, minArea: 55, maxArea: 75 })
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const msgs = result.error.issues.map(i => i.message);
      expect(msgs.some(m => m.includes("maxArea"))).toBe(true);
    }
  });

  it("rejects minArea > maxArea", () => {
    const result = SpaceTypeSchema.safeParse(
      makeSpace({ areaPerUnit: 65, minArea: 80, maxArea: 60 })
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const msgs = result.error.issues.map(i => i.message);
      expect(
        msgs.some(m => m.includes("minArea must be"))
      ).toBe(true);
    }
  });

  it("accepts areaPerUnit at exact boundaries", () => {
    const result = SpaceTypeSchema.safeParse(
      makeSpace({ areaPerUnit: 55, minArea: 55, maxArea: 55 })
    );
    expect(result.success).toBe(true);
  });

  it("accepts space without minArea/maxArea", () => {
    const result = SpaceTypeSchema.safeParse(
      makeSpace({
        minArea: undefined,
        maxArea: undefined,
        areaPerUnit: 65,
      })
    );
    expect(result.success).toBe(true);
  });
});

// ---- AdjacencyRuleSchema Tests ---------------------------------------

describe("AdjacencyRuleSchema", () => {
  it("accepts a valid adjacency rule", () => {
    const result = AdjacencyRuleSchema.safeParse(makeAdj());
    expect(result.success).toBe(true);
  });

  // #9: kebab-case ID
  it("rejects non-kebab-case adjacency ID", () => {
    const result = AdjacencyRuleSchema.safeParse(
      makeAdj({ id: "ADJ_BAD" })
    );
    expect(result.success).toBe(false);
  });

  // #4: self-loop
  it("rejects self-loop (fromSpaceId === toSpaceId)", () => {
    const result = AdjacencyRuleSchema.safeParse(
      makeAdj({
        fromSpaceId: "test-space-a",
        toSpaceId: "test-space-a",
      })
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const msgs = result.error.issues.map(i => i.message);
      expect(msgs.some(m => m.includes("Self-loop"))).toBe(true);
    }
  });

  // #5: normalisation invariant
  it("rejects un-normalised pair (fromSpaceId > toSpaceId)", () => {
    const result = AdjacencyRuleSchema.safeParse(
      makeAdj({
        fromSpaceId: "zzz-space",
        toSpaceId: "aaa-space",
      })
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const msgs = result.error.issues.map(i => i.message);
      expect(
        msgs.some(m => m.includes("Normalisation violated"))
      ).toBe(true);
    }
  });

  // #10: weight min 0.01
  it("rejects weight of 0", () => {
    const result = AdjacencyRuleSchema.safeParse(
      makeAdj({ weight: 0 })
    );
    expect(result.success).toBe(false);
  });

  it("accepts weight of 0.01", () => {
    const result = AdjacencyRuleSchema.safeParse(
      makeAdj({ weight: 0.01 })
    );
    expect(result.success).toBe(true);
  });

  it("rejects weight > 1", () => {
    const result = AdjacencyRuleSchema.safeParse(
      makeAdj({ weight: 1.5 })
    );
    expect(result.success).toBe(false);
  });
});

// ---- BuildingConstraintSchema Tests ----------------------------------

describe("BuildingConstraintSchema", () => {
  it("accepts valid constraints", () => {
    const result = BuildingConstraintSchema.safeParse(
      makeConstraints()
    );
    expect(result.success).toBe(true);
  });

  // #8: maxFloors × floorHeight ≤ maxBuildingHeightM
  it("rejects when maxFloors × floorHeight > maxBuildingHeightM", () => {
    const result = BuildingConstraintSchema.safeParse(
      makeConstraints({
        maxFloors: 10,
        floorHeight: 3.6,
        maxBuildingHeightM: 24,
      })
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const msgs = result.error.issues.map(i => i.message);
      expect(
        msgs.some(m => m.includes("exceeds maxBuildingHeightM"))
      ).toBe(true);
    }
  });

  it("accepts exact boundary (maxFloors × floorHeight === maxBuildingHeightM)", () => {
    const result = BuildingConstraintSchema.safeParse(
      makeConstraints({
        maxFloors: 6,
        floorHeight: 4.0,
        maxBuildingHeightM: 24,
      })
    );
    expect(result.success).toBe(true);
  });
});

// ---- ProgramSpecSchema Tests -----------------------------------------

describe("ProgramSpecSchema", () => {
  it("accepts a valid spec", () => {
    const result = ProgramSpecSchema.safeParse(makeSpec());
    expect(result.success).toBe(true);
  });

  // #1: schemaVersion
  it("rejects missing schemaVersion", () => {
    const spec = makeSpec();
    delete (spec as Record<string, unknown>).schemaVersion;
    const result = ProgramSpecSchema.safeParse(spec);
    expect(result.success).toBe(false);
  });

  it("rejects wrong schemaVersion", () => {
    const result = ProgramSpecSchema.safeParse(
      makeSpec({ schemaVersion: "2.0.0" })
    );
    expect(result.success).toBe(false);
  });

  // #3: duplicate space IDs
  it("rejects duplicate space IDs", () => {
    const result = ProgramSpecSchema.safeParse(
      makeSpec({
        spaces: [
          makeSpace({ id: "dup-id" }),
          makeSpace({ id: "dup-id", name: "Duplicate" }),
        ],
        adjacencies: [],
      })
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const msgs = result.error.issues.map(i => i.message);
      expect(
        msgs.some(m => m.includes("Duplicate space ID"))
      ).toBe(true);
    }
  });

  // #3: duplicate adjacency IDs
  it("rejects duplicate adjacency IDs", () => {
    const result = ProgramSpecSchema.safeParse(
      makeSpec({
        adjacencies: [
          makeAdj({ id: "adj-dup" }),
          makeAdj({
            id: "adj-dup",
            fromSpaceId: "test-space-a",
            toSpaceId: "test-space-b",
          }),
        ],
      })
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const msgs = result.error.issues.map(i => i.message);
      expect(
        msgs.some(m => m.includes("Duplicate adjacency ID"))
      ).toBe(true);
    }
  });

  // #2: cross-reference — unknown fromSpaceId
  it("rejects adjacency referencing unknown fromSpaceId", () => {
    const result = ProgramSpecSchema.safeParse(
      makeSpec({
        adjacencies: [
          makeAdj({
            fromSpaceId: "nonexistent",
            toSpaceId: "test-space-b",
          }),
        ],
      })
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const msgs = result.error.issues.map(i => i.message);
      expect(
        msgs.some(m => m.includes("unknown") && m.includes("fromSpaceId"))
      ).toBe(true);
    }
  });

  // #2: cross-reference — unknown toSpaceId
  it("rejects adjacency referencing unknown toSpaceId", () => {
    const result = ProgramSpecSchema.safeParse(
      makeSpec({
        adjacencies: [
          makeAdj({
            fromSpaceId: "test-space-a",
            toSpaceId: "zzz-nonexistent",
          }),
        ],
      })
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const msgs = result.error.issues.map(i => i.message);
      expect(
        msgs.some(m => m.includes("unknown") && m.includes("toSpaceId"))
      ).toBe(true);
    }
  });

  // #7: floorMandatory >= maxFloors
  it("rejects floorMandatory >= maxFloors", () => {
    const result = ProgramSpecSchema.safeParse(
      makeSpec({
        spaces: [
          makeSpace({ id: "test-space-a", floorMandatory: 6 }),
          makeSpace({ id: "test-space-b" }),
        ],
        constraints: makeConstraints({ maxFloors: 6 }),
      })
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const msgs = result.error.issues.map(i => i.message);
      expect(
        msgs.some(m => m.includes("floorMandatory"))
      ).toBe(true);
    }
  });

  it("accepts floorMandatory === maxFloors - 1", () => {
    const result = ProgramSpecSchema.safeParse(
      makeSpec({
        spaces: [
          makeSpace({ id: "test-space-a", floorMandatory: 5 }),
          makeSpace({ id: "test-space-b" }),
        ],
        constraints: makeConstraints({ maxFloors: 6 }),
      })
    );
    expect(result.success).toBe(true);
  });
});

// ---- createAdjacencyRule Helper Tests --------------------------------

describe("createAdjacencyRule", () => {
  it("normalises pair so fromSpaceId < toSpaceId", () => {
    const rule = createAdjacencyRule({
      id: "adj-norm",
      fromSpaceId: "zzz-space",
      toSpaceId: "aaa-space",
      type: "should_adjacent",
      weight: 0.5,
    });
    expect(rule.fromSpaceId).toBe("aaa-space");
    expect(rule.toSpaceId).toBe("zzz-space");
  });

  it("keeps already-normalised pair unchanged", () => {
    const rule = createAdjacencyRule({
      id: "adj-ok",
      fromSpaceId: "aaa-space",
      toSpaceId: "zzz-space",
      type: "must_adjacent",
      weight: 1.0,
    });
    expect(rule.fromSpaceId).toBe("aaa-space");
    expect(rule.toSpaceId).toBe("zzz-space");
  });

  it("throws on self-loop", () => {
    expect(() =>
      createAdjacencyRule({
        id: "adj-self",
        fromSpaceId: "same",
        toSpaceId: "same",
        type: "should_adjacent",
        weight: 0.5,
      })
    ).toThrow();
  });
});

// ---- validateProgramSpec Helper Tests --------------------------------

describe("validateProgramSpec", () => {
  it("returns success for valid spec", () => {
    const result = validateProgramSpec(makeSpec());
    expect(result.success).toBe(true);
  });

  it("returns error for invalid spec", () => {
    const result = validateProgramSpec({ bad: "data" });
    expect(result.success).toBe(false);
  });
});

// ---- computeTotalArea Helper Tests -----------------------------------

describe("computeTotalArea", () => {
  it("sums quantity × areaPerUnit", () => {
    const spaces = [
      makeSpace({ quantity: 2, areaPerUnit: 100 }),
      makeSpace({ id: "test-space-b", quantity: 3, areaPerUnit: 50 }),
    ];
    expect(computeTotalArea(spaces)).toBe(350);
  });

  it("returns 0 for empty array", () => {
    expect(computeTotalArea([])).toBe(0);
  });
});

// ---- getAdjacenciesForSpace Helper Tests -----------------------------

describe("getAdjacenciesForSpace", () => {
  const adjs = [
    makeAdj({
      id: "adj-1",
      fromSpaceId: "aaa",
      toSpaceId: "bbb",
    }),
    makeAdj({
      id: "adj-2",
      fromSpaceId: "bbb",
      toSpaceId: "ccc",
    }),
    makeAdj({
      id: "adj-3",
      fromSpaceId: "ddd",
      toSpaceId: "eee",
    }),
  ];

  it("finds rules where space is fromSpaceId", () => {
    const result = getAdjacenciesForSpace("aaa", adjs);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("adj-1");
  });

  it("finds rules where space is toSpaceId", () => {
    const result = getAdjacenciesForSpace("ccc", adjs);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("adj-2");
  });

  it("finds rules on both sides", () => {
    const result = getAdjacenciesForSpace("bbb", adjs);
    expect(result).toHaveLength(2);
  });

  it("returns empty for unrelated space", () => {
    const result = getAdjacenciesForSpace("zzz", adjs);
    expect(result).toHaveLength(0);
  });
});

// ---- JCTIC Template Validation Tests ---------------------------------

describe("JCTIC Template", () => {
  it("passes full ProgramSpec validation", () => {
    const result = ProgramSpecSchema.safeParse(jcticTemplate);
    expect(result.success).toBe(true);
  });

  it("has correct schemaVersion", () => {
    expect(jcticTemplate.schemaVersion).toBe(
      PROGRAM_SPEC_SCHEMA_VERSION
    );
  });

  // #12: art-sculpture should NOT have clusterGroup
  it("art-sculpture has no clusterGroup (independent on 1/F)", () => {
    const sculpture = jcticTemplate.spaces.find(
      s => s.id === "art-sculpture"
    );
    expect(sculpture).toBeDefined();
    expect(sculpture!.clusterGroup).toBeUndefined();
  });

  it("all space IDs are unique", () => {
    const ids = jcticTemplate.spaces.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all adjacency IDs are unique", () => {
    const ids = jcticTemplate.adjacencies.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all adjacency space references exist", () => {
    const spaceIds = new Set(jcticTemplate.spaces.map(s => s.id));
    for (const adj of jcticTemplate.adjacencies) {
      expect(spaceIds.has(adj.fromSpaceId)).toBe(true);
      expect(spaceIds.has(adj.toSpaceId)).toBe(true);
    }
  });

  it("all floorMandatory values are < maxFloors", () => {
    for (const s of jcticTemplate.spaces) {
      if (s.floorMandatory !== undefined) {
        expect(s.floorMandatory).toBeLessThan(
          jcticTemplate.constraints.maxFloors
        );
      }
    }
  });
});
