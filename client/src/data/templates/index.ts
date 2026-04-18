// ============================================================
// SentiArch — Template Registry
//
// Plugin-ready registry for programme-specification templates.
// To add a new template:
//   1. Create a new file in this directory (e.g. `primary.ts`)
//      exporting a `ProgramSpec` constant.
//   2. Import it here and add an entry to `TEMPLATE_REGISTRY`.
//
// The registry is intentionally a plain Map so that future
// plugins or user-uploaded templates can be registered at
// runtime via `registerTemplate()`.
// ============================================================

import type { ProgramSpec } from "@/types/program";
import { ProgramSpecSchema } from "@/types/program";
import { jcticTemplate } from "./jctic";

// ---- Registry Types --------------------------------------------------

/**
 * Metadata shown in the template picker UI.
 */
export interface TemplateMeta {
  /** Unique template identifier (must match `ProgramSpec.id`). */
  id: string;
  /** Display name (bilingual recommended). */
  name: string;
  /** Short description for the picker card. */
  description: string;
  /**
   * Building typology tag for filtering.
   * Extensible — add new values as templates are contributed.
   */
  typology:
    | "secondary_school"
    | "primary_school"
    | "university"
    | "residential"
    | "office"
    | "mixed_use";
  /** Number of distinct space types in the template. */
  spaceCount: number;
  /** Total programme area in m² (sum of quantity × areaPerUnit). */
  totalAreaM2: number;
}

/**
 * A registered template entry containing both metadata and the
 * full specification data.
 */
export interface TemplateEntry {
  meta: TemplateMeta;
  /** Lazily validated `ProgramSpec` data. */
  data: ProgramSpec;
}

// ---- Internal Store --------------------------------------------------

const registry = new Map<string, TemplateEntry>();

// ---- Public API ------------------------------------------------------

/**
 * Register a template in the global registry.
 *
 * Validates the `ProgramSpec` with Zod before accepting it.
 * Throws if validation fails — callers should handle this
 * gracefully in the UI layer.
 *
 * @returns The computed {@link TemplateMeta} for the template.
 */
export function registerTemplate(
  data: ProgramSpec,
  typology: TemplateMeta["typology"]
): TemplateMeta {
  // Validate at registration time so downstream code can
  // assume the data is well-formed.
  const parsed = ProgramSpecSchema.parse(data);

  const totalAreaM2 = parsed.spaces.reduce(
    (sum, s) => sum + s.quantity * s.areaPerUnit,
    0
  );

  const meta: TemplateMeta = {
    id: parsed.id,
    name: parsed.name,
    description: parsed.description ?? "",
    typology,
    spaceCount: parsed.spaces.length,
    totalAreaM2,
  };

  registry.set(parsed.id, { meta, data: parsed });
  return meta;
}

/**
 * Retrieve a template by its ID.
 *
 * Returns `undefined` if the ID is not registered.
 */
export function getTemplate(id: string): TemplateEntry | undefined {
  return registry.get(id);
}

/**
 * List metadata for all registered templates.
 *
 * Useful for populating a template-picker dropdown or card grid.
 */
export function listTemplates(): TemplateMeta[] {
  return Array.from(registry.values()).map(entry => entry.meta);
}

/**
 * List templates filtered by building typology.
 */
export function listTemplatesByTypology(
  typology: TemplateMeta["typology"]
): TemplateMeta[] {
  return listTemplates().filter(m => m.typology === typology);
}

/**
 * Remove a template from the registry.
 *
 * Returns `true` if the template existed and was removed.
 */
export function unregisterTemplate(id: string): boolean {
  return registry.delete(id);
}

// ---- Built-in Templates (auto-registered) ----------------------------

registerTemplate(jcticTemplate, "secondary_school");
