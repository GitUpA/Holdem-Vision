/**
 * File-based audit writer — Node-only utility for tests and scripts.
 *
 * Produces identical JSON artifacts to the UI's /api/audit route.
 * Never imported by HandSession itself (which stays pure TS / browser-safe).
 */
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import type { HandRecord } from "../../convex/lib/audit/types";

/** Ephemeral test output — wiped before each test run. */
export const TEST_AUDIT_DIR = "data/audits/test";

/** Persistent output — never auto-wiped, for manual scenario analysis. */
export const SAVED_AUDIT_DIR = "data/audits/saved";

/**
 * Returns an `onHandComplete` callback that writes each HandRecord
 * as `${dir}/${handId}.json` — identical format to the UI's API route.
 */
export function fileAuditWriter(dir: string): (record: HandRecord) => void {
  mkdirSync(dir, { recursive: true });
  return (record: HandRecord) => {
    const filePath = join(dir, `${record.handId}.json`);
    writeFileSync(filePath, JSON.stringify(record, null, 2), "utf-8");
  };
}

/**
 * Remove all files in `dir` and recreate it empty.
 * Safe to call on non-existent directories.
 */
export function cleanDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}
