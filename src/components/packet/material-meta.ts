/** How a material is labelled and where clicking it goes — shared by the packet and the library. */
import type { MaterialSummary } from "@/types/course-materials";

const EXTENSION_LABEL: Record<string, string> = {
  pdf: "PDF",
  ppt: "PPT",
  pptx: "PPT",
  doc: "DOC",
  docx: "DOC",
  xls: "XLS",
  xlsx: "XLS",
  csv: "CSV",
  txt: "TXT",
  png: "IMG",
  jpg: "IMG",
  jpeg: "IMG",
  mp4: "VID",
  mov: "VID",
  zip: "ZIP",
};

const KIND_LABEL: Record<MaterialSummary["kind"], string> = {
  FILE: "FILE",
  PAGE: "PAGE",
  EXTERNAL_URL: "LINK",
  EXTERNAL_TOOL: "TOOL",
  ASSIGNMENT: "TASK",
  QUIZ: "QUIZ",
  DISCUSSION: "DISC",
  SUBHEADER: "",
};

/** Short mono tag: the file's type for files, the kind otherwise. */
export function kindLabel(m: Pick<MaterialSummary, "kind" | "fileName">): string {
  if (m.kind === "FILE" && m.fileName) {
    const ext = m.fileName.split(".").pop()?.toLowerCase() ?? "";
    return EXTENSION_LABEL[ext] ?? "FILE";
  }
  return KIND_LABEL[m.kind];
}

export function sizeLabel(bytes: number | null): string | null {
  if (bytes == null) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface OpenTarget {
  href: string;
  /** Leaves Erwin (Canvas or the open web). */
  external: boolean;
}

/**
 * Where a material opens. A cached file opens its local copy and a page opens
 * in the library — both skip the Canvas login. Anything Erwin couldn't
 * mirror (locked, oversized, publisher tools) falls back to Canvas.
 */
export function openTarget(m: MaterialSummary): OpenTarget | null {
  if (m.kind === "FILE" && m.cached) return { href: `/api/erwin/materials/${m.id}/file`, external: false };
  if (m.kind === "PAGE") return { href: `/courses?m=${m.id}`, external: false };
  return m.htmlUrl ? { href: m.htmlUrl, external: true } : null;
}

/** Why a material isn't available locally, in a word or two; null when it's fine. */
export function statusLabel(m: MaterialSummary): string | null {
  if (m.locked) return "locked";
  if (m.kind === "FILE" && !m.cached) {
    if (m.downloadError?.includes("cap")) return "too large";
    return m.downloadError ? "not saved" : "on Canvas";
  }
  if (m.kind === "EXTERNAL_TOOL") return "Canvas only";
  return null;
}
