"use client";

import * as React from "react";
import { ChevronRight, ChevronsDownUp, ChevronsUpDown, FileText, Folder, FolderOpen, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { DocFile, TreeNode, SectionTree, SectionGroup } from "./docs-types";
import {
  sortFolderNodes,
  getSectionLabel,
  getGroupLabel,
  getSectionKey,
  countNodeFiles,
  basename,
  groupSectionsIntoServices,
} from "./docs-tree-utils";

type DocsSidebarProps = {
  files: DocFile[];
  selectedFileId: string | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  listLoading: boolean;
  tree: SectionTree[];
  groupedTree: SectionGroup[];
  activeGroupTab: string | null;
  activeGroupSections: SectionTree[];
  collapsedFolders: Set<string>;
  collapsedSections: Set<string>;
  collapsedServices: Set<string>;
  selectedFile: DocFile | null;
  onToggleFolder: (fullPath: string) => void;
  onSwitchGroupTab: (group: string) => void;
  onToggleSection: (group: string, section: string) => void;
  onToggleService: (service: string) => void;
  onSelectFile: (id: string) => void;
  onCollapseAll?: () => void;
  onExpandAll?: () => void;
};

export function DocsSidebar({
  files,
  selectedFileId,
  searchQuery,
  onSearchChange,
  listLoading,
  tree,
  groupedTree,
  activeGroupTab,
  activeGroupSections,
  collapsedFolders,
  collapsedSections,
  collapsedServices,
  selectedFile,
  onToggleFolder,
  onSwitchGroupTab,
  onToggleSection,
  onToggleService,
  onSelectFile,
  onCollapseAll,
  onExpandAll,
}: DocsSidebarProps) {
  const renderNode = (node: TreeNode, depth: number) => {
    const isSearching = searchQuery.length > 0;

    return (
      <div key={node.fullPath}>
        {sortFolderNodes(node.children).map((child) => {
          const isCollapsed = !isSearching && collapsedFolders.has(child.fullPath);
          const fileCount = countNodeFiles(child);
          return (
            <div key={child.fullPath}>
              <button
                type="button"
                onClick={() => onToggleFolder(child.fullPath)}
                className="docs-nav-folder"
                style={{ paddingLeft: `${depth * 10 + 4}px` }}
              >
                <ChevronRight className={cn("h-3 w-3 shrink-0 text-muted-foreground/70 transition-transform duration-150", !isCollapsed && "rotate-90")} />
                {isCollapsed
                  ? <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                  : <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                }
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{child.name}</span>
                {fileCount > 0 && (
                  <span className="shrink-0 rounded-full bg-muted/60 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground/70">
                    {fileCount}
                  </span>
                )}
              </button>
              {!isCollapsed && renderNode(child, depth + 1)}
            </div>
          );
        })}

        {node.files.map((file) => {
          const isActive = file.id === selectedFileId;
          return (
            <button
              key={file.id}
              type="button"
              onClick={() => onSelectFile(file.id)}
              aria-pressed={isActive}
              className={cn("docs-nav-file", isActive && "docs-nav-file-active")}
              style={{ paddingLeft: `${(depth + 1) * 10 + 4}px` }}
            >
              <FileText className={cn("h-3.5 w-3.5 shrink-0", isActive ? "text-primary" : "text-muted-foreground/50")} />
              <span className="truncate">{basename(file.name)}</span>
            </button>
          );
        })}
      </div>
    );
  };

  const renderSection = (section: string, root: TreeNode) => {
    const sectionKey = getSectionKey(activeGroupTab!, section);
    const sectionCollapsed = searchQuery.length === 0 && collapsedSections.has(sectionKey);
    const isActiveSection = selectedFile?.section === section;
    return (
      <div key={section}>
        <button
          type="button"
          onClick={() => onToggleSection(activeGroupTab!, section)}
          className={cn(
            "docs-nav-section",
            isActiveSection && "text-foreground",
          )}
        >
          <ChevronRight className={cn("h-3 w-3 shrink-0 text-muted-foreground/70 transition-transform duration-150", !sectionCollapsed && "rotate-90")} />
          <span className="min-w-0 flex-1 truncate">
            {getSectionLabel(section)}
          </span>
          <span className="shrink-0 rounded-full bg-muted/60 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
            {countNodeFiles(root)}
          </span>
        </button>

        {!sectionCollapsed && (
          <div className="ml-3 border-l border-border/40">
            {renderNode(root, 0)}
          </div>
        )}
      </div>
    );
  };

  const renderServiceGrouped = () => {
    const { standalone, services } = groupSectionsIntoServices(activeGroupSections);
    return (
      <div className="space-y-1.5">
        {standalone.map(({ section, root }) => renderSection(section, root))}

        {services.map(({ service, sections }) => {
          const serviceCollapsed = searchQuery.length === 0 && collapsedServices.has(service);
          const totalFiles = sections.reduce((sum, { root }) => sum + countNodeFiles(root), 0);
          return (
            <div key={service}>
              <button
                type="button"
                onClick={() => onToggleService(service)}
                className="docs-nav-service"
              >
                <ChevronRight className={cn("h-3 w-3 shrink-0 text-muted-foreground/70 transition-transform duration-150", !serviceCollapsed && "rotate-90")} />
                <span className="min-w-0 flex-1 truncate">{service}</span>
                <span className="shrink-0 rounded-full bg-muted/60 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                  {totalFiles}
                </span>
              </button>

              {!serviceCollapsed && (
                <div className="ml-3 border-l border-border/40 space-y-0.5">
                  {sections.map(({ section, root }) => renderSection(section, root))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderFlat = () => (
    <div className="space-y-1.5">
      {activeGroupSections.map(({ section, root }) => renderSection(section, root))}
    </div>
  );

  const isServiceGrouped = activeGroupTab === "cortana-external";
  const showTree = !listLoading && files.length > 0 && tree.length > 0;

  return (
    <nav className="space-y-3">
      {/* Search + collapse/expand */}
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search docs..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-8 pl-8 pr-8 text-sm"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {showTree && onCollapseAll && onExpandAll && (
          <div className="flex shrink-0">
            <button
              type="button"
              onClick={onCollapseAll}
              className="rounded-md p-1.5 text-muted-foreground/60 transition-colors hover:text-foreground hover:bg-muted/40"
              aria-label="Collapse all"
              title="Collapse all"
            >
              <ChevronsDownUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onExpandAll}
              className="rounded-md p-1.5 text-muted-foreground/60 transition-colors hover:text-foreground hover:bg-muted/40"
              aria-label="Expand all"
              title="Expand all"
            >
              <ChevronsUpDown className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Segmented group control */}
      {groupedTree.length > 1 && (
        <div className="docs-segment-bar">
          {groupedTree.map(({ group }) => (
            <button
              key={group}
              type="button"
              onClick={() => onSwitchGroupTab(group)}
              className={cn(
                "docs-segment-tab",
                activeGroupTab === group && "docs-segment-tab-active",
              )}
            >
              {getGroupLabel(group)}
            </button>
          ))}
        </div>
      )}

      {/* Section tree */}
      {listLoading ? (
        <p className="px-2 py-4 text-sm text-muted-foreground">Loading docs...</p>
      ) : files.length === 0 ? (
        <p className="px-2 py-4 text-sm text-muted-foreground">No markdown files found.</p>
      ) : tree.length === 0 ? (
        <p className="px-2 py-4 text-sm text-muted-foreground">No results for &ldquo;{searchQuery}&rdquo;</p>
      ) : isServiceGrouped ? (
        renderServiceGrouped()
      ) : (
        renderFlat()
      )}
    </nav>
  );
}
