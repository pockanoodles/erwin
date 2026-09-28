/**
 * On-disk cache for Canvas course files. Local runtime state, outside the
 * repo: `ERWIN_MATERIALS_DIR` (default ~/.erwin/materials), one folder per
 * Canvas course, one file per Canvas file id — shared by every module item
 * that points at it.
 */
import { createWriteStream } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";

const DEFAULT_MAX_FILE_MB = 100;

export function materialsRoot(): string {
  return process.env.ERWIN_MATERIALS_DIR || path.join(os.homedir(), ".erwin", "materials");
}

/** Files above this are recorded but not downloaded (lecture recordings, datasets). */
export function maxFileBytes(): number {
  const mb = Number(process.env.ERWIN_MATERIALS_MAX_FILE_MB);
  return (Number.isFinite(mb) && mb > 0 ? mb : DEFAULT_MAX_FILE_MB) * 1_000_000;
}

function safeName(name: string): string {
  return name.replace(/[/\\:\0]/g, "_").slice(0, 150) || "file";
}

export function localPathFor(courseCanvasId: string, fileCanvasId: string, displayName: string): string {
  return path.join(materialsRoot(), courseCanvasId, `${fileCanvasId}-${safeName(displayName)}`);
}

/**
 * Write a download to `dest` via a temp file + rename, so a failed or
 * interrupted download never leaves a truncated file that looks complete.
 */
export async function writeDownload(
  body: ReadableStream<Uint8Array>,
  dest: string
): Promise<void> {
  await mkdir(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.partial`;
  try {
    await pipeline(
      Readable.fromWeb(body as unknown as WebReadableStream<Uint8Array>),
      createWriteStream(tmp)
    );
    await rename(tmp, dest);
  } catch (error) {
    await rm(tmp, { force: true });
    throw error;
  }
}

/** Only serve paths inside the cache root — a stored path is data, not trust. */
export function isInsideMaterialsRoot(p: string): boolean {
  const rel = path.relative(materialsRoot(), path.resolve(p));
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}
