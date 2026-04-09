"use client";

import { useState } from "react";
import { ChevronDown, List, Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useDocs } from "./use-docs";
import { DocsSidebar } from "./docs-sidebar";
import { DocsToc } from "./docs-toc";
import { DocsContent } from "./docs-content";

export default function DocsClient() {
  const docs = useDocs();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  if (docs.listError) {
    return (
      <div className="space-y-4">
        <DocsHeader />
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-base">Docs unavailable</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{docs.listError}</CardContent>
        </Card>
      </div>
    );
  }

  const sidebarContent = (
    <DocsSidebar
      files={docs.files}
      selectedFileId={docs.selectedFileId}
      searchQuery={docs.searchQuery}
      onSearchChange={docs.setSearchQuery}
      listLoading={docs.listLoading}
      tree={docs.tree}
      groupedTree={docs.groupedTree}
      activeGroupTab={docs.activeGroupTab}
      activeGroupSections={docs.activeGroupSections}
      collapsedFolders={docs.collapsedFolders}
      collapsedSections={docs.collapsedSections}
      collapsedServices={docs.collapsedServices}
      selectedFile={docs.selectedFile}
      onToggleFolder={docs.toggleFolder}
      onSwitchGroupTab={docs.switchGroupTab}
      onToggleSection={docs.toggleSection}
      onToggleService={docs.toggleService}
      onSelectFile={docs.selectFile}
    />
  );

  const tocContent = (
    <DocsToc
      headings={docs.headings}
      activeHeadingId={docs.activeHeadingId}
      contentRef={docs.contentRef}
      onHeadingClick={docs.setActiveHeadingId}
    />
  );

  return (
    <div className="space-y-4">
      <DocsHeader sidebarCollapsed={sidebarCollapsed} onToggleSidebar={() => setSidebarCollapsed((c) => !c)} />

      {/* Mobile top bar */}
      <div className="flex items-center gap-2 md:hidden">
        <button
          type="button"
          onClick={() => docs.setMobileSidebarOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/40"
        >
          <Menu className="h-4 w-4" />
          Browse
        </button>
        {docs.selectedFile && (
          <span className="truncate text-sm text-muted-foreground">{docs.selectedFile.name}</span>
        )}
      </div>

      {/* Mobile sidebar overlay */}
      {docs.mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => docs.setMobileSidebarOpen(false)} />
          <div className="fixed inset-y-0 left-0 z-50 w-80 max-w-[calc(100vw-3rem)] overflow-y-auto border-r bg-background shadow-lg">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="text-sm font-semibold">Documentation</span>
              <button
                type="button"
                onClick={() => docs.setMobileSidebarOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-3">{sidebarContent}</div>
          </div>
        </div>
      )}

      {/* Three-column grid */}
      <div
        className={cn(
          "transition-[grid-template-columns] duration-300 ease-in-out md:grid md:gap-6 xl:gap-10",
          sidebarCollapsed
            ? "md:grid-cols-[0px_minmax(0,1fr)] xl:grid-cols-[0px_minmax(0,1fr)_11rem]"
            : "md:grid-cols-[16rem_minmax(0,1fr)] xl:grid-cols-[16rem_minmax(0,1fr)_11rem]",
        )}
      >
        {/* Left sidebar (desktop) */}
        <aside className={cn("hidden md:block overflow-hidden transition-opacity duration-300", sidebarCollapsed ? "opacity-0 pointer-events-none" : "opacity-100")}>
          <div className="sticky top-8 max-h-[calc(100vh-4rem)] overflow-y-auto rounded-lg border border-border/50 bg-card/30 p-3">
            {sidebarContent}
          </div>
        </aside>

        {/* Center content */}
        <div className="min-w-0">

          {/* Mobile/tablet TOC accordion */}
          {docs.headings.length > 0 && (
            <div className="mb-4 xl:hidden">
              <button
                type="button"
                onClick={() => docs.setMobileTocOpen((o) => !o)}
                className="flex w-full items-center justify-between rounded-md border border-border/50 bg-muted/20 px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <span className="flex items-center gap-1.5">
                  <List className="h-3.5 w-3.5" />
                  On this page
                </span>
                <ChevronDown className={cn("h-4 w-4 transition-transform", docs.mobileTocOpen && "rotate-180")} />
              </button>
              {docs.mobileTocOpen && (
                <div className="mt-1 rounded-md border border-border/50 bg-card/40 p-3">
                  {tocContent}
                </div>
              )}
            </div>
          )}

          {/* Content card */}
          <div className={cn("rounded-xl border border-border/40 bg-card shadow-sm transition-[max-width] duration-300", sidebarCollapsed ? "mx-auto max-w-4xl" : "")}>
            <div className="docs-content-wrapper px-4 py-5 md:px-6 md:py-6">
              <DocsContent
                selectedFile={docs.selectedFile}
                files={docs.files}
                content={docs.content}
                contentLoading={docs.contentLoading}
                contentError={docs.contentError}
                breadcrumbs={docs.breadcrumbs}
                contentRef={docs.contentRef}
                onNavigate={docs.selectFile}
              />
            </div>
          </div>
        </div>

        {/* Right TOC rail (desktop only) */}
        <aside className="hidden xl:block">
          <div className="sticky top-8 max-h-[calc(100vh-4rem)] overflow-y-auto">
            {tocContent}
          </div>
        </aside>
      </div>
    </div>
  );
}

function DocsHeader({ sidebarCollapsed, onToggleSidebar }: { sidebarCollapsed?: boolean; onToggleSidebar?: () => void }) {
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
        Docs Library
      </p>
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Documentation</h1>
      <div className="flex items-center gap-2">
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="hidden md:inline-flex shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground hover:bg-muted/40"
            aria-label={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
          >
            {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        )}
        <p className="text-sm text-muted-foreground">
          Browse markdown documentation grouped by repo ownership across cortana-external and OpenClaw.
        </p>
      </div>
    </div>
  );
}
