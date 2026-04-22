/**
 * build-index.ts
 *
 * Walks the effects/ directory tree, reads every *.json metadata file
 * (skipping index.json), and merges them into a single effects/index.json
 * that the Easy Spin web app fetches at startup.
 *
 * Usage:  npx tsx scripts/build-index.ts
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, relative, dirname, basename } from "node:path";
import { globSync } from "glob";

// ── Types ────────────────────────────────────────────────────────────

interface EffectControl {
  pot: number;
  name: string;
  description: string;
  unit: string;
  range: [number, number];
}

interface EffectMeta {
  id: string;
  name: string;
  version: string;
  description: string;
  category: string;
  tags: string[];
  author: string;
  license?: string;
  hasSource: boolean;
  controls: EffectControl[];
}

interface IndexEntry extends EffectMeta {
  /** Relative directory path from the repo root, e.g. "effects/delay" */
  directoryPath: string;
  /** Base filename of the .json file (without extension), e.g. "digital-delay" */
  file: string;
  /** URL to the .spn source on GitHub, e.g. "https://github.com/audiofab/easy-spin-effects/blob/main/effects/reverb/spring-reverb.spn" */
  sourceUrl: string;
}

interface EffectIndex {
  version: string;
  generatedAt: string;
  categories: string[];
  effects: IndexEntry[];
}

// ── Helpers ──────────────────────────────────────────────────────────

const REPO_ROOT = resolve(__dirname, "..");
const EFFECTS_DIR = resolve(REPO_ROOT, "effects");
const INDEX_PATH = resolve(EFFECTS_DIR, "index.json");
const GITHUB_BLOB_BASE =
  "https://github.com/audiofab/easy-spin-effects/blob/main";

const REQUIRED_FIELDS: (keyof EffectMeta)[] = [
  "id",
  "name",
  "version",
  "description",
  "category",
  "tags",
  "author",
  "hasSource",
  "controls",
];

function validate(meta: Record<string, unknown>, filePath: string): void {
  for (const field of REQUIRED_FIELDS) {
    if (!(field in meta)) {
      throw new Error(`Missing required field "${field}" in ${filePath}`);
    }
  }
  const controls = meta.controls as EffectControl[];
  if (!Array.isArray(controls) || controls.length === 0) {
    throw new Error(`"controls" must be a non-empty array in ${filePath}`);
  }
  for (const ctrl of controls) {
    if (typeof ctrl.pot !== "number" || !ctrl.name) {
      throw new Error(
        `Invalid control entry in ${filePath}: each control needs "pot" (number) and "name" (string)`
      );
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────

function buildIndex(): void {
  // Find all .json files under effects/, excluding index.json itself
  const jsonFiles = globSync("effects/**/*.json", {
    cwd: REPO_ROOT,
    posix: true,
  }).filter((f) => basename(f) !== "index.json");

  if (jsonFiles.length === 0) {
    console.error("No effect JSON files found under effects/");
    process.exit(1);
  }

  console.log(`Found ${jsonFiles.length} effect(s):\n`);

  const entries: IndexEntry[] = [];

  for (const relPath of jsonFiles) {
    const absPath = resolve(REPO_ROOT, relPath);
    const raw = readFileSync(absPath, "utf-8");
    let meta: Record<string, unknown>;

    try {
      meta = JSON.parse(raw);
    } catch {
      console.error(`  ✗ ${relPath} — invalid JSON`);
      process.exit(1);
    }

    validate(meta, relPath);

    const dirPath = dirname(relPath); // e.g. "effects/delay"
    const file = basename(relPath, ".json"); // e.g. "digital-delay"

    // Check that the .spn source exists if hasSource is true
    if (meta.hasSource) {
      const spnPath = resolve(dirname(absPath), `${file}.spn`);
      if (!existsSync(spnPath)) {
        console.warn(
          `  ⚠ ${relPath} — hasSource is true but ${file}.spn not found`
        );
      }
    }

    const sourceUrl = `${GITHUB_BLOB_BASE}/${dirPath}/${file}.spn`;

    const entry: IndexEntry = {
      ...(meta as unknown as EffectMeta),
      directoryPath: dirPath,
      file,
      sourceUrl,
    };

    entries.push(entry);
    console.log(`  ✓ ${entry.name} (${entry.category}) — ${relPath}`);
  }

  // Sort: by category first, then by name within each category
  entries.sort((a, b) => {
    const catCmp = a.category.localeCompare(b.category);
    if (catCmp !== 0) return catCmp;
    return a.name.localeCompare(b.name);
  });

  // Extract unique categories in sorted order
  const categories = [...new Set(entries.map((e) => e.category))].sort();

  const index: EffectIndex = {
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    categories,
    effects: entries,
  };

  writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2) + "\n", "utf-8");
  console.log(
    `\n✓ Generated ${INDEX_PATH} with ${entries.length} effects in ${categories.length} categories`
  );
}

buildIndex();
