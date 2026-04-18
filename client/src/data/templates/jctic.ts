// ============================================================
// SentiArch — JCTIC Template (賽馬會體藝中學)
// Jockey Club Ti-I College Programme Specification
//
// Based on the actual floor distribution of JCTIC:
//   G/F  — Public facilities (演講廳, 圖書館, 畫廊, 體育館, 游泳池, 籃球場)
//   1/F  — IT + Standard classrooms + Sculpture studio
//   2/F  — Art cluster (版畫, 音樂, 陶瓷, 設計裝置藝術, 攝影, 樂隊)
//   3/F  — Assembly + Sports centre + STEM + Classrooms + English
//   4/F  — Science cluster (地理, 電腦, 物理, 綜合科學, 生物, 化學)
//   5/F  — Residential & Admin (宿舍, 會議室, 洗衣房, 飯堂, 自修室)
//
// Area references follow Hong Kong EDB guidelines and typical
// school-building practice:
//   Standard classroom  ≈ 65 m²  (30 students × ~2.2 m²/student)
//   Science lab          ≈ 90–100 m²
//   Art studio           ≈ 80–100 m²
//   Library              ≈ 200–300 m²
//   Gymnasium            ≈ 600–800 m²
//   Assembly hall        ≈ 400–500 m²
// ============================================================

import {
  createAdjacencyRule,
  type ProgramSpec,
  type SpaceType,
  type AdjacencyRule,
  type BuildingConstraint,
} from "@/types/program";

// ---- Colour Palette (by category) -----------------------------------

const COLORS = {
  academic: "#5B8DEF",
  art: "#E07BE0",
  science: "#4DC9A0",
  public: "#F5A623",
  sport: "#FF6B6B",
  support: "#A0A4B8",
  residential: "#C9A04D",
  admin: "#7B8CDE",
} as const;

// ---- Space Definitions -----------------------------------------------

/**
 * All space types for the JCTIC template.
 *
 * IDs follow the pattern `<short-category>-<slug>` for
 * readability in adjacency rules and debugging output.
 */
const spaces: SpaceType[] = [
  // ── G/F — Public Facilities ──────────────────────────────
  {
    id: "pub-lecture-hall",
    name: "演講廳 Lecture Hall",
    category: "public",
    quantity: 1,
    areaPerUnit: 200,
    minArea: 180,
    maxArea: 250,
    occupancy: 150,
    requiredFeatures: ["acoustic_isolation", "accessible"],
    floorPreference: "ground",
    floorMandatory: 0,
    clusterGroup: "public-gf",
    colorHex: COLORS.public,
  },
  {
    id: "pub-library",
    name: "圖書館 Library",
    category: "public",
    quantity: 1,
    areaPerUnit: 250,
    minArea: 200,
    maxArea: 300,
    occupancy: 80,
    requiredFeatures: ["natural_light", "accessible"],
    floorPreference: "ground",
    floorMandatory: 0,
    clusterGroup: "public-gf",
    colorHex: COLORS.public,
  },
  {
    id: "art-gallery",
    name: "畫廊 Gallery",
    category: "art",
    quantity: 1,
    areaPerUnit: 120,
    minArea: 100,
    maxArea: 150,
    occupancy: 40,
    requiredFeatures: ["natural_light", "accessible"],
    floorPreference: "ground",
    floorMandatory: 0,
    clusterGroup: "public-gf",
    colorHex: COLORS.art,
  },
  {
    id: "spt-gymnasium",
    name: "體育館 Gymnasium",
    category: "sport",
    quantity: 1,
    areaPerUnit: 700,
    minArea: 600,
    maxArea: 800,
    occupancy: 200,
    requiredFeatures: [
      "natural_ventilation",
      "accessible",
      "heavy_load",
    ],
    floorPreference: "ground",
    floorMandatory: 0,
    clusterGroup: "sport-gf",
    colorHex: COLORS.sport,
  },
  {
    id: "spt-swimming-pool",
    name: "游泳池 Swimming Pool",
    category: "sport",
    quantity: 1,
    areaPerUnit: 500,
    minArea: 400,
    maxArea: 600,
    occupancy: 60,
    requiredFeatures: [
      "wet_services",
      "natural_ventilation",
      "accessible",
      "heavy_load",
    ],
    floorPreference: "ground",
    floorMandatory: 0,
    clusterGroup: "sport-gf",
    colorHex: COLORS.sport,
  },
  {
    id: "spt-basketball-court",
    name: "籃球場 Basketball Court",
    category: "sport",
    quantity: 1,
    areaPerUnit: 600,
    minArea: 500,
    maxArea: 700,
    occupancy: 40,
    requiredFeatures: [
      "external_access",
      "accessible",
      "heavy_load",
    ],
    floorPreference: "ground",
    floorMandatory: 0,
    clusterGroup: "sport-gf",
    colorHex: COLORS.sport,
  },

  // ── 1/F — IT + Standard Classrooms + Sculpture ──────────
  {
    id: "acad-cal-room",
    name: "電腦輔助學習室 CAL Room",
    category: "academic",
    quantity: 2,
    areaPerUnit: 70,
    minArea: 60,
    maxArea: 80,
    occupancy: 30,
    requiredFeatures: ["natural_light"],
    floorPreference: "low",
    floorMandatory: 1,
    colorHex: COLORS.academic,
  },
  {
    id: "acad-classroom-a",
    name: "甲型課室 Classroom Type A",
    category: "academic",
    quantity: 6,
    areaPerUnit: 65,
    minArea: 55,
    maxArea: 75,
    occupancy: 30,
    requiredFeatures: ["natural_light", "natural_ventilation"],
    floorPreference: "low",
    floorMandatory: 1,
    colorHex: COLORS.academic,
  },
  {
    id: "art-sculpture",
    name: "雕塑工作室 Sculpture Studio",
    category: "art",
    quantity: 1,
    areaPerUnit: 90,
    minArea: 80,
    maxArea: 100,
    occupancy: 25,
    requiredFeatures: [
      "natural_light",
      "wet_services",
      "heavy_load",
    ],
    floorPreference: "low",
    floorMandatory: 1,
    clusterGroup: "art",
    colorHex: COLORS.art,
  },

  // ── 2/F — Art Cluster ───────────────────────────────────
  {
    id: "art-printmaking",
    name: "版畫工作室 Printmaking Studio",
    category: "art",
    quantity: 1,
    areaPerUnit: 85,
    minArea: 75,
    maxArea: 100,
    occupancy: 25,
    requiredFeatures: ["natural_light", "wet_services"],
    floorPreference: "low",
    floorMandatory: 2,
    clusterGroup: "art",
    colorHex: COLORS.art,
  },
  {
    id: "art-music-room",
    name: "音樂室 Music Room",
    category: "art",
    quantity: 1,
    areaPerUnit: 80,
    minArea: 70,
    maxArea: 90,
    occupancy: 35,
    requiredFeatures: ["acoustic_isolation"],
    floorPreference: "low",
    floorMandatory: 2,
    clusterGroup: "art",
    colorHex: COLORS.art,
  },
  {
    id: "art-ceramics",
    name: "陶瓷工作室 Ceramics Studio",
    category: "art",
    quantity: 1,
    areaPerUnit: 90,
    minArea: 80,
    maxArea: 100,
    occupancy: 25,
    requiredFeatures: [
      "natural_light",
      "wet_services",
      "heavy_load",
    ],
    floorPreference: "low",
    floorMandatory: 2,
    clusterGroup: "art",
    colorHex: COLORS.art,
  },
  {
    id: "art-design-installation",
    name: "設計裝置藝術工作室 Design & Installation Art Studio",
    category: "art",
    quantity: 1,
    areaPerUnit: 95,
    minArea: 80,
    maxArea: 110,
    occupancy: 25,
    requiredFeatures: ["natural_light"],
    floorPreference: "low",
    floorMandatory: 2,
    clusterGroup: "art",
    colorHex: COLORS.art,
  },
  {
    id: "art-photography",
    name: "攝影室 Photography Studio",
    category: "art",
    quantity: 1,
    areaPerUnit: 70,
    minArea: 60,
    maxArea: 80,
    occupancy: 20,
    requiredFeatures: ["acoustic_isolation"],
    floorPreference: "low",
    floorMandatory: 2,
    clusterGroup: "art",
    colorHex: COLORS.art,
  },
  {
    id: "art-band-room",
    name: "樂隊室 Band Room",
    category: "art",
    quantity: 1,
    areaPerUnit: 85,
    minArea: 75,
    maxArea: 100,
    occupancy: 40,
    requiredFeatures: ["acoustic_isolation"],
    floorPreference: "low",
    floorMandatory: 2,
    clusterGroup: "art",
    colorHex: COLORS.art,
  },

  // ── 3/F — Assembly + Sports Centre + STEM + Classrooms ──
  {
    id: "pub-assembly-hall",
    name: "禮堂 Assembly Hall",
    category: "public",
    quantity: 1,
    areaPerUnit: 450,
    minArea: 400,
    maxArea: 500,
    occupancy: 500,
    requiredFeatures: ["acoustic_isolation", "accessible"],
    floorPreference: "mid",
    floorMandatory: 3,
    colorHex: COLORS.public,
  },
  {
    id: "spt-hui-centre",
    name: "Dr. Stephen Hui 體育中心 Hui Sports Centre",
    category: "sport",
    quantity: 1,
    areaPerUnit: 400,
    minArea: 350,
    maxArea: 500,
    occupancy: 100,
    requiredFeatures: [
      "natural_ventilation",
      "accessible",
      "heavy_load",
    ],
    floorPreference: "mid",
    floorMandatory: 3,
    colorHex: COLORS.sport,
  },
  {
    id: "sci-stem-room",
    name: "STEM 室 STEM Room",
    category: "science",
    quantity: 1,
    areaPerUnit: 90,
    minArea: 80,
    maxArea: 100,
    occupancy: 30,
    requiredFeatures: ["natural_light"],
    floorPreference: "mid",
    floorMandatory: 3,
    colorHex: COLORS.science,
  },
  {
    id: "acad-classroom-b",
    name: "乙型課室 Classroom Type B",
    category: "academic",
    quantity: 4,
    areaPerUnit: 65,
    minArea: 55,
    maxArea: 75,
    occupancy: 30,
    requiredFeatures: ["natural_light", "natural_ventilation"],
    floorPreference: "mid",
    floorMandatory: 3,
    colorHex: COLORS.academic,
  },
  {
    id: "acad-english-centre",
    name: "英語中心 English Centre",
    category: "academic",
    quantity: 1,
    areaPerUnit: 70,
    minArea: 60,
    maxArea: 80,
    occupancy: 30,
    requiredFeatures: ["natural_light", "acoustic_isolation"],
    floorPreference: "mid",
    floorMandatory: 3,
    colorHex: COLORS.academic,
  },

  // ── 4/F — Science Cluster ──────────────────────────────
  {
    id: "sci-geography",
    name: "地理室 Geography Room",
    category: "science",
    quantity: 1,
    areaPerUnit: 75,
    minArea: 65,
    maxArea: 85,
    occupancy: 30,
    requiredFeatures: ["natural_light"],
    floorPreference: "mid",
    floorMandatory: 4,
    clusterGroup: "science",
    colorHex: COLORS.science,
  },
  {
    id: "sci-computer-room",
    name: "電腦室 Computer Room",
    category: "science",
    quantity: 1,
    areaPerUnit: 75,
    minArea: 65,
    maxArea: 85,
    occupancy: 30,
    requiredFeatures: ["natural_light"],
    floorPreference: "mid",
    floorMandatory: 4,
    clusterGroup: "science",
    colorHex: COLORS.science,
  },
  {
    id: "sci-physics-lab",
    name: "物理實驗室 Physics Lab",
    category: "science",
    quantity: 1,
    areaPerUnit: 95,
    minArea: 90,
    maxArea: 100,
    occupancy: 30,
    requiredFeatures: [
      "natural_light",
      "natural_ventilation",
      "wet_services",
    ],
    floorPreference: "mid",
    floorMandatory: 4,
    clusterGroup: "science",
    colorHex: COLORS.science,
  },
  {
    id: "sci-integrated-lab",
    name: "綜合科學實驗室 Integrated Science Lab",
    category: "science",
    quantity: 2,
    areaPerUnit: 95,
    minArea: 90,
    maxArea: 100,
    occupancy: 30,
    requiredFeatures: [
      "natural_light",
      "natural_ventilation",
      "wet_services",
    ],
    floorPreference: "mid",
    floorMandatory: 4,
    clusterGroup: "science",
    colorHex: COLORS.science,
  },
  {
    id: "sci-biology-lab",
    name: "生物實驗室 Biology Lab",
    category: "science",
    quantity: 1,
    areaPerUnit: 95,
    minArea: 90,
    maxArea: 100,
    occupancy: 30,
    requiredFeatures: [
      "natural_light",
      "natural_ventilation",
      "wet_services",
    ],
    floorPreference: "mid",
    floorMandatory: 4,
    clusterGroup: "science",
    colorHex: COLORS.science,
  },
  {
    id: "sci-chemistry-lab",
    name: "化學實驗室 Chemistry Lab",
    category: "science",
    quantity: 1,
    areaPerUnit: 95,
    minArea: 90,
    maxArea: 100,
    occupancy: 30,
    requiredFeatures: [
      "natural_light",
      "natural_ventilation",
      "wet_services",
    ],
    floorPreference: "mid",
    floorMandatory: 4,
    clusterGroup: "science",
    colorHex: COLORS.science,
  },

  // ── 5/F — Residential & Admin ──────────────────────────
  {
    id: "res-dormitory",
    name: "學生宿舍 Student Dormitory",
    category: "residential",
    quantity: 1,
    areaPerUnit: 300,
    minArea: 250,
    maxArea: 400,
    occupancy: 60,
    requiredFeatures: [
      "natural_light",
      "natural_ventilation",
      "accessible",
    ],
    floorPreference: "high",
    floorMandatory: 5,
    clusterGroup: "residential",
    colorHex: COLORS.residential,
  },
  {
    id: "adm-meeting-room",
    name: "會議室 Meeting Room",
    category: "admin",
    quantity: 2,
    areaPerUnit: 40,
    minArea: 30,
    maxArea: 50,
    occupancy: 15,
    requiredFeatures: ["natural_light"],
    floorPreference: "high",
    floorMandatory: 5,
    clusterGroup: "admin",
    colorHex: COLORS.admin,
  },
  {
    id: "sup-laundry",
    name: "洗衣房 Laundry",
    category: "support",
    quantity: 1,
    areaPerUnit: 30,
    minArea: 25,
    maxArea: 40,
    occupancy: 5,
    requiredFeatures: ["wet_services"],
    floorPreference: "high",
    floorMandatory: 5,
    clusterGroup: "residential",
    colorHex: COLORS.support,
  },
  {
    id: "sup-canteen",
    name: "飯堂 Canteen",
    category: "support",
    quantity: 1,
    areaPerUnit: 150,
    minArea: 120,
    maxArea: 200,
    occupancy: 100,
    requiredFeatures: [
      "natural_ventilation",
      "wet_services",
      "accessible",
    ],
    floorPreference: "high",
    floorMandatory: 5,
    clusterGroup: "residential",
    colorHex: COLORS.support,
  },
  {
    id: "acad-study-room",
    name: "自修室 Study Room",
    category: "academic",
    quantity: 1,
    areaPerUnit: 60,
    minArea: 50,
    maxArea: 80,
    occupancy: 40,
    requiredFeatures: ["natural_light"],
    floorPreference: "high",
    floorMandatory: 5,
    clusterGroup: "residential",
    colorHex: COLORS.academic,
  },
];

// ---- Adjacency Rules -------------------------------------------------

/**
 * Default adjacency rules for JCTIC.
 *
 * All rules are created via {@link createAdjacencyRule} which
 * guarantees the undirected normalisation invariant
 * (`fromSpaceId < toSpaceId`).
 */
const adjacencies: AdjacencyRule[] = [
  // ── Art cluster (2/F) — should be adjacent ──────────────
  createAdjacencyRule({
    id: "adj-art-print-ceramics",
    fromSpaceId: "art-printmaking",
    toSpaceId: "art-ceramics",
    type: "should_adjacent",
    weight: 0.8,
    reason:
      "Both require wet services; shared prep/cleanup area beneficial",
  }),
  createAdjacencyRule({
    id: "adj-art-print-design",
    fromSpaceId: "art-printmaking",
    toSpaceId: "art-design-installation",
    type: "should_adjacent",
    weight: 0.7,
    reason: "Visual arts cluster on 2/F",
  }),
  createAdjacencyRule({
    id: "adj-art-ceramics-design",
    fromSpaceId: "art-ceramics",
    toSpaceId: "art-design-installation",
    type: "should_adjacent",
    weight: 0.7,
    reason: "Visual arts cluster on 2/F",
  }),
  createAdjacencyRule({
    id: "adj-art-music-band",
    fromSpaceId: "art-music-room",
    toSpaceId: "art-band-room",
    type: "should_adjacent",
    weight: 0.9,
    reason:
      "Music and band share instruments and acoustic infrastructure",
  }),
  createAdjacencyRule({
    id: "adj-art-photo-design",
    fromSpaceId: "art-photography",
    toSpaceId: "art-design-installation",
    type: "prefer_nearby",
    weight: 0.5,
    reason: "Photography supports design documentation",
  }),
  createAdjacencyRule({
    id: "adj-art-sculpture-ceramics",
    fromSpaceId: "art-sculpture",
    toSpaceId: "art-ceramics",
    type: "prefer_nearby",
    weight: 0.6,
    reason:
      "Both are 3-D art forms sharing similar material handling needs",
  }),

  // ── Science cluster (4/F) — should be adjacent ─────────
  createAdjacencyRule({
    id: "adj-sci-physics-integrated",
    fromSpaceId: "sci-physics-lab",
    toSpaceId: "sci-integrated-lab",
    type: "should_adjacent",
    weight: 0.8,
    reason: "Shared equipment and prep rooms",
  }),
  createAdjacencyRule({
    id: "adj-sci-bio-chem",
    fromSpaceId: "sci-biology-lab",
    toSpaceId: "sci-chemistry-lab",
    type: "should_adjacent",
    weight: 0.8,
    reason: "Shared fume-hood infrastructure and prep rooms",
  }),
  createAdjacencyRule({
    id: "adj-sci-bio-integrated",
    fromSpaceId: "sci-biology-lab",
    toSpaceId: "sci-integrated-lab",
    type: "should_adjacent",
    weight: 0.7,
    reason: "Science cluster co-location",
  }),
  createAdjacencyRule({
    id: "adj-sci-chem-integrated",
    fromSpaceId: "sci-chemistry-lab",
    toSpaceId: "sci-integrated-lab",
    type: "should_adjacent",
    weight: 0.7,
    reason: "Science cluster co-location",
  }),
  createAdjacencyRule({
    id: "adj-sci-stem-computer",
    fromSpaceId: "sci-stem-room",
    toSpaceId: "sci-computer-room",
    type: "prefer_nearby",
    weight: 0.6,
    reason: "STEM activities often require computing resources",
  }),

  // ── Sport cluster (G/F) — should be adjacent ───────────
  createAdjacencyRule({
    id: "adj-spt-gym-pool",
    fromSpaceId: "spt-gymnasium",
    toSpaceId: "spt-swimming-pool",
    type: "should_adjacent",
    weight: 0.7,
    reason: "Shared changing rooms and PE scheduling",
  }),
  createAdjacencyRule({
    id: "adj-spt-gym-basketball",
    fromSpaceId: "spt-gymnasium",
    toSpaceId: "spt-basketball-court",
    type: "should_adjacent",
    weight: 0.7,
    reason: "Sports facilities cluster",
  }),

  // ── Public facilities (G/F) — prefer nearby ────────────
  createAdjacencyRule({
    id: "adj-pub-lecture-library",
    fromSpaceId: "pub-lecture-hall",
    toSpaceId: "pub-library",
    type: "prefer_nearby",
    weight: 0.5,
    reason: "Both serve as public-facing learning spaces",
  }),
  createAdjacencyRule({
    id: "adj-pub-gallery-library",
    fromSpaceId: "art-gallery",
    toSpaceId: "pub-library",
    type: "prefer_nearby",
    weight: 0.5,
    reason: "Gallery visitors may also use library resources",
  }),

  // ── Residential cluster (5/F) — should be adjacent ─────
  createAdjacencyRule({
    id: "adj-res-dorm-canteen",
    fromSpaceId: "res-dormitory",
    toSpaceId: "sup-canteen",
    type: "should_adjacent",
    weight: 0.8,
    reason: "Residents need convenient dining access",
  }),
  createAdjacencyRule({
    id: "adj-res-dorm-laundry",
    fromSpaceId: "res-dormitory",
    toSpaceId: "sup-laundry",
    type: "must_adjacent",
    weight: 1.0,
    reason: "Laundry must be directly accessible from dormitory",
  }),
  createAdjacencyRule({
    id: "adj-res-dorm-study",
    fromSpaceId: "acad-study-room",
    toSpaceId: "res-dormitory",
    type: "should_adjacent",
    weight: 0.7,
    reason: "Evening study access for boarding students",
  }),

  // ── Separation rules (noise, fumes) ────────────────────
  createAdjacencyRule({
    id: "adj-sep-chem-library",
    fromSpaceId: "pub-library",
    toSpaceId: "sci-chemistry-lab",
    type: "must_separate",
    weight: 1.0,
    reason:
      "Chemical fumes and ventilation exhaust must not reach library",
  }),
  createAdjacencyRule({
    id: "adj-sep-band-classroom-a",
    fromSpaceId: "acad-classroom-a",
    toSpaceId: "art-band-room",
    type: "must_separate",
    weight: 1.0,
    reason: "Band room noise disrupts classroom instruction",
  }),
  createAdjacencyRule({
    id: "adj-sep-band-classroom-b",
    fromSpaceId: "acad-classroom-b",
    toSpaceId: "art-band-room",
    type: "must_separate",
    weight: 1.0,
    reason: "Band room noise disrupts classroom instruction",
  }),
  createAdjacencyRule({
    id: "adj-sep-gym-classroom-a",
    fromSpaceId: "acad-classroom-a",
    toSpaceId: "spt-gymnasium",
    type: "must_separate",
    weight: 0.9,
    reason:
      "Gymnasium noise and circulation conflict with classrooms",
  }),
  createAdjacencyRule({
    id: "adj-sep-gym-classroom-b",
    fromSpaceId: "acad-classroom-b",
    toSpaceId: "spt-gymnasium",
    type: "must_separate",
    weight: 0.9,
    reason:
      "Gymnasium noise and circulation conflict with classrooms",
  }),
];

// ---- Building Constraints --------------------------------------------

const constraints: BuildingConstraint = {
  maxFloors: 6, // G/F through 5/F
  floorHeight: 3.6, // metres — standard HK school floor height
  siteAreaM2: 10000, // approximate JCTIC site area
  maxBuildingHeightM: 24, // HK Buildings Ordinance limit
  minCorridorWidthM: 1.5, // minimum accessible corridor width
  targetTotalAreaM2: 8500, // estimated total programme area
};

// ---- Assembled Template ──────────────────────────────────────────────

const now = new Date().toISOString();

/**
 * Complete programme specification for 賽馬會體藝中學 (JCTIC).
 *
 * This template can be loaded as-is into the Programme
 * Specification Editor, or cloned and modified for
 * design-option studies.
 */
export const jcticTemplate: ProgramSpec = {
  id: "tpl-jctic-v1",
  name: "賽馬會體藝中學 JCTIC",
  description:
    "Jockey Club Ti-I College — a secondary school emphasising " +
    "art and physical education, with boarding facilities. " +
    "Based on the actual JCTIC floor distribution (G/F–5/F).",
  spaces,
  adjacencies,
  constraints,
  createdAt: now,
  updatedAt: now,
};
