// ============================================================
// ProgramSpecEditor — Export / Import Utilities
// ============================================================

import {
  ProgramSpecSchema,
  type ProgramSpec,
} from "@/types/program";

const STORAGE_KEY = "sentiarch_program_spec";

// ---- localStorage Persistence ----------------------------------------

export function saveToLocalStorage(spec: ProgramSpec): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(spec));
}

export function loadFromLocalStorage(): ProgramSpec | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const result = ProgramSpecSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

// ---- JSON File Export ------------------------------------------------

export function exportToJson(spec: ProgramSpec): void {
  const blob = new Blob([JSON.stringify(spec, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${spec.name.replace(/\s+/g, "_")}_program_spec.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---- JSON File Import ------------------------------------------------

export interface ImportResult {
  success: boolean;
  data?: ProgramSpec;
  errors?: string[];
}

export function importFromJson(file: File): Promise<ImportResult> {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        const result = ProgramSpecSchema.safeParse(parsed);
        if (result.success) {
          resolve({ success: true, data: result.data });
        } else {
          resolve({
            success: false,
            errors: result.error.issues.map(i => {
              const path =
                i.path.length > 0
                  ? `[${i.path.join(".")}] `
                  : "";
              return `${path}${i.message}`;
            }),
          });
        }
      } catch (e) {
        resolve({
          success: false,
          errors: [`Invalid JSON: ${(e as Error).message}`],
        });
      }
    };
    reader.onerror = () => {
      resolve({ success: false, errors: ["Failed to read file"] });
    };
    reader.readAsText(file);
  });
}
