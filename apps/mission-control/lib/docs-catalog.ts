import fs from "fs/promises";
import path from "path";
import {
  getCortanaSourceRepo,
  getCorticalLoopPath,
  getDocsPath,
  getExternalResearchPath,
  getHooksPath,
  getImmuneSystemPath,
  getKnowledgePath,
  getProprioceptionPath,
  getResearchPath,
  getSaePath,
} from "@/lib/runtime-paths";

export type DocEntry = { id: string; name: string; path: string; section: string };

export type DocsListResponse =
  | { status: "ok"; files: DocEntry[] }
  | { status: "error"; message: string };

export type DocContentResponse =
  | { status: "ok"; name: string; content: string }
  | { status: "error"; message: string };

const getRepoRoot = () => path.resolve(process.cwd(), "..", "..");
const getBacktesterRoot = () => path.resolve(process.cwd(), "..", "..", "backtester");
const getExternalDocsRoot = () => path.join(getRepoRoot(), "docs");
const getExternalKnowledgeRoot = () => path.join(getRepoRoot(), "knowledge");
const getMcDocsRoot = () => path.join(process.cwd(), "docs");
const getMcKnowledgeRoot = () => path.join(process.cwd(), "knowledge");
const getMcResearchRoot = () => path.join(process.cwd(), "research");
const getExtSvcRoot = () => path.resolve(process.cwd(), "..", "external-service");
const getBacktesterKnowledgeRoot = () => path.join(getBacktesterRoot(), "knowledge");

const toDocId = (section: string, relativePath: string) => `${section}:${relativePath}`;
const toPosixPath = (value: string) => value.split(path.sep).join("/");

const DOC_SECTION_ORDER = [
  "External Docs",
  "External Knowledge",
  "Mission Control Docs",
  "Mission Control Knowledge",
  "Mission Control Research",
  "External Service Docs",
  "External Service Knowledge",
  "External Service Research",
  "Backtester Docs",
  "Backtester Knowledge",
  "Backtester Research",
  "OpenClaw Docs",
  "OpenClaw Knowledge",
  "OpenClaw Research",
] as const;

function isArchiveDocName(name: string): boolean {
  return name.split("/").includes("archive");
}

function compareDocNames(a: string, b: string): number {
  const aArchive = isArchiveDocName(a);
  const bArchive = isArchiveDocName(b);
  if (aArchive !== bArchive) return aArchive ? 1 : -1;
  return a.localeCompare(b);
}

async function collectDocs(
  docsRoot: string,
  section: string,
  baseRoot = docsRoot,
): Promise<DocEntry[]> {
  const entries = await fs.readdir(docsRoot, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(docsRoot, entry.name);

      if (entry.isDirectory()) {
        return collectDocs(entryPath, section, baseRoot);
      }

      if (!entry.isFile() || !entry.name.endsWith(".md")) {
        return [];
      }

      const relativePath = toPosixPath(path.relative(baseRoot, entryPath));
      return [{
        id: toDocId(section, relativePath),
        name: relativePath,
        path: entryPath,
        section,
      }];
    }),
  );

  return files.flat().sort((a, b) => compareDocNames(a.name, b.name));
}

async function listBacktesterDocs(backtesterRoot: string): Promise<DocEntry[]> {
  const docsRoot = path.join(backtesterRoot, "docs");
  let files: DocEntry[] = [];

  try {
    files = await collectDocs(docsRoot, "Backtester Docs");
  } catch {
    return [];
  }

  const readmePath = path.join(backtesterRoot, "README.md");

  try {
    const stats = await fs.stat(readmePath);
    if (stats.isFile()) {
      files.unshift({
        id: toDocId("Backtester Docs", "backtester-README.md"),
        name: "backtester-README.md",
        path: readmePath,
        section: "Backtester Docs",
      });
    }
  } catch {
    // optional readme
  }

  return files;
}

async function collectOptionalDocs(
  docsRoot: string,
  section: string,
  baseRoot = docsRoot,
): Promise<DocEntry[]> {
  try {
    return await collectDocs(docsRoot, section, baseRoot);
  } catch {
    return [];
  }
}

async function listExternalResearchDocs(researchRoot: string): Promise<DocEntry[]> {
  const results = await Promise.all([
    collectOptionalDocs(path.join(researchRoot, "raw", "mission-control"), "Mission Control Research", researchRoot),
    collectOptionalDocs(path.join(researchRoot, "derived", "mission-control"), "Mission Control Research", researchRoot),
    collectOptionalDocs(path.join(researchRoot, "raw", "backtester"), "Backtester Research", researchRoot),
    collectOptionalDocs(path.join(researchRoot, "derived", "backtester"), "Backtester Research", researchRoot),
  ]);

  return results.flat().sort((a, b) => {
    const sectionOrder =
      DOC_SECTION_ORDER.indexOf(a.section as (typeof DOC_SECTION_ORDER)[number]) -
      DOC_SECTION_ORDER.indexOf(b.section as (typeof DOC_SECTION_ORDER)[number]);
    if (sectionOrder !== 0) return sectionOrder;
    return compareDocNames(a.name, b.name);
  });
}

export async function listAllDocs(): Promise<DocEntry[]> {
  const results = await Promise.allSettled([
    collectDocs(getExternalDocsRoot(), "External Docs"),
    collectOptionalDocs(getExternalKnowledgeRoot(), "External Knowledge"),
    collectOptionalDocs(getMcDocsRoot(), "Mission Control Docs"),
    collectOptionalDocs(getMcKnowledgeRoot(), "Mission Control Knowledge"),
    collectOptionalDocs(getMcResearchRoot(), "Mission Control Research"),
    listExternalResearchDocs(getExternalResearchPath()),
    collectOptionalDocs(path.join(getExtSvcRoot(), "docs"), "External Service Docs"),
    collectOptionalDocs(path.join(getExtSvcRoot(), "knowledge"), "External Service Knowledge"),
    collectOptionalDocs(path.join(getExtSvcRoot(), "research"), "External Service Research"),
    listBacktesterDocs(getBacktesterRoot()),
    collectOptionalDocs(getBacktesterKnowledgeRoot(), "Backtester Knowledge"),
    collectDocs(getDocsPath(), "OpenClaw Docs"),
    collectDocs(getKnowledgePath(), "OpenClaw Knowledge"),
    collectDocs(getResearchPath(), "OpenClaw Research"),
    collectOptionalDocs(getCorticalLoopPath(), "OpenClaw Knowledge", getCortanaSourceRepo()),
    collectOptionalDocs(getImmuneSystemPath(), "OpenClaw Knowledge", getCortanaSourceRepo()),
    collectOptionalDocs(getProprioceptionPath(), "OpenClaw Knowledge", getCortanaSourceRepo()),
    collectOptionalDocs(getSaePath(), "OpenClaw Knowledge", getCortanaSourceRepo()),
    collectOptionalDocs(getHooksPath(), "OpenClaw Knowledge", getCortanaSourceRepo()),
  ]);

  const files = results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));

  return files.sort((a, b) => {
    const sectionOrder =
      DOC_SECTION_ORDER.indexOf(a.section as (typeof DOC_SECTION_ORDER)[number]) -
      DOC_SECTION_ORDER.indexOf(b.section as (typeof DOC_SECTION_ORDER)[number]);
    if (sectionOrder !== 0) return sectionOrder;
    return compareDocNames(a.name, b.name);
  });
}

export async function readDocContent(fileId: string): Promise<DocContentResponse> {
  const docs = await listAllDocs();
  const match = docs.find((entry) => entry.id === fileId);
  if (!match) {
    return { status: "error", message: "File not found." };
  }

  const stats = await fs.stat(match.path);
  if (!stats.isFile()) {
    return { status: "error", message: "File not found." };
  }

  return {
    status: "ok",
    name: match.name,
    content: await fs.readFile(match.path, "utf8"),
  };
}
