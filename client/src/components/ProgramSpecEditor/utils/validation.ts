// ============================================================
// ProgramSpecEditor — Validation Utilities
//
// Wraps the Zod schemas from program.ts for UI-friendly
// error reporting.
// ============================================================

import {
  ProgramSpecSchema,
  type ProgramSpec,
} from "@/types/program";

/**
 * Validate a ProgramSpec and return an array of human-readable
 * error messages.  Returns an empty array if valid.
 */
export function validateSpec(spec: ProgramSpec): string[] {
  const result = ProgramSpecSchema.safeParse(spec);
  if (result.success) return [];
  return result.error.issues.map(issue => {
    const path = issue.path.length > 0 ? `[${issue.path.join(".")}] ` : "";
    return `${path}${issue.message}`;
  });
}
