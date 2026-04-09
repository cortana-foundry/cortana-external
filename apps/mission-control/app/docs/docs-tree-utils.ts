import type { DocFile, TreeNode, SectionTree, SectionGroup } from "./docs-types";

/* ── constants ── */

const SECTION_GROUP_ORDER = ["cortana-external", "OpenClaw"] as const;

/* ── pure helpers ── */

function isArchiveFolderPath(fullPath: string): boolean {
  return fullPath.split("/").includes("archive");
}

export function sortFolderNodes(nodes: TreeNode[]): TreeNode[] {
  return [...nodes].sort((a, b) => {
    const aArchive = isArchiveFolderPath(a.fullPath);
    const bArchive = isArchiveFolderPath(b.fullPath);
    if (aArchive !== bArchive) return aArchive ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}

export function collectFolderPaths(node: TreeNode): string[] {
  const paths: string[] = [];
  for (const child of node.children) {
    paths.push(child.fullPath);
    paths.push(...collectFolderPaths(child));
  }
  return paths;
}

export function getSectionGroup(section: string): string {
  if (
    section === "External Docs" ||
    section === "Mission Control Research" ||
    section === "Backtester Docs" ||
    section === "Backtester Research"
  ) {
    return "cortana-external";
  }
  return "OpenClaw";
}

export function getSectionLabel(section: string): string {
  if (section === "External Docs") return "Repo Docs";
  if (section.startsWith("OpenClaw ")) return section.replace("OpenClaw ", "");
  return section;
}

export function getGroupLabel(group: string): string {
  if (group === "cortana-external") return "cortana-external";
  return group;
}

export function getSectionKey(group: string, section: string): string {
  return `${group}::${section}`;
}

export function buildFolderTree(files: DocFile[], searchQuery: string): SectionTree[] {
  const query = searchQuery.toLowerCase();
  const filtered = query ? files.filter((f) => f.name.toLowerCase().includes(query)) : files;

  const bySection = new Map<string, DocFile[]>();
  for (const f of filtered) {
    const arr = bySection.get(f.section) ?? [];
    arr.push(f);
    bySection.set(f.section, arr);
  }

  return Array.from(bySection.entries()).map(([section, sectionFiles]) => {
    const root: TreeNode = { name: section, fullPath: section, children: [], files: [] };

    for (const file of sectionFiles) {
      const segments = file.name.split("/");
      let current = root;

      for (let i = 0; i < segments.length - 1; i++) {
        const seg = segments[i];
        let child = current.children.find((c) => c.name === seg);
        if (!child) {
          child = { name: seg, fullPath: `${current.fullPath}/${seg}`, children: [], files: [] };
          current.children.push(child);
        }
        current = child;
      }

      current.files.push(file);
    }

    return { section, root };
  });
}

export function groupSectionTrees(sections: SectionTree[]): SectionGroup[] {
  const grouped = new Map<string, SectionTree[]>();
  for (const sectionTree of sections) {
    const group = getSectionGroup(sectionTree.section);
    const items = grouped.get(group) ?? [];
    items.push(sectionTree);
    grouped.set(group, items);
  }

  return SECTION_GROUP_ORDER.flatMap((group) => {
    const sectionsForGroup = grouped.get(group);
    if (!sectionsForGroup || sectionsForGroup.length === 0) return [];
    return [{ group, sections: sectionsForGroup }];
  });
}

export function countNodeFiles(node: TreeNode): number {
  return node.files.length + node.children.reduce((sum, child) => sum + countNodeFiles(child), 0);
}

export function collectAncestorFolderPaths(file: DocFile | null): string[] {
  if (!file) return [];
  const segments = file.name.split("/");
  const ancestors: string[] = [];
  let current = file.section;
  for (let i = 0; i < segments.length - 1; i++) {
    current = `${current}/${segments[i]}`;
    ancestors.push(current);
  }
  return ancestors;
}

export function deriveBreadcrumbs(file: DocFile | null): string[] {
  if (!file) return [];
  return [getSectionLabel(file.section), ...file.name.split("/")];
}

export function basename(name: string): string {
  const parts = name.split("/");
  return parts[parts.length - 1].replace(/\.md$/i, "");
}

export function isArchiveFile(file: DocFile): boolean {
  return file.name.split("/").includes("archive");
}
