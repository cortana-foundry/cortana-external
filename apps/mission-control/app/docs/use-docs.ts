"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { extractHeadings } from "@/lib/markdown-utils";
import type { DocFile, DocsListResponse, DocContentResponse } from "./docs-types";
import {
  buildFolderTree,
  groupSectionTrees,
  deriveBreadcrumbs,
  getSectionGroup,
  getSectionKey,
  collectFolderPaths,
  collectAncestorFolderPaths,
  isArchiveFile,
} from "./docs-tree-utils";

export function useDocs() {
  const [files, setFiles] = useState<DocFile[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [activeGroupTab, setActiveGroupTab] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [collapsedServices, setCollapsedServices] = useState<Set<string>>(new Set());
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileTocOpen, setMobileTocOpen] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);

  const contentRef = useRef<HTMLDivElement>(null);

  /* ── derived ── */
  const selectedFile = useMemo(
    () => files.find((f) => f.id === selectedFileId) ?? null,
    [files, selectedFileId],
  );
  const tree = useMemo(() => buildFolderTree(files, searchQuery), [files, searchQuery]);
  const groupedTree = useMemo(() => groupSectionTrees(tree), [tree]);
  const headings = useMemo(() => extractHeadings(content), [content]);
  const breadcrumbs = useMemo(() => deriveBreadcrumbs(selectedFile), [selectedFile]);
  const activeGroup = useMemo(
    () => (selectedFile ? getSectionGroup(selectedFile.section) : null),
    [selectedFile],
  );
  const activeSectionKey = useMemo(
    () => (selectedFile ? getSectionKey(getSectionGroup(selectedFile.section), selectedFile.section) : null),
    [selectedFile],
  );

  /* ── data fetching ── */
  useEffect(() => {
    let active = true;
    const loadList = async () => {
      try {
        setListLoading(true);
        const response = await fetch("/api/docs", { cache: "no-store" });
        const payload = (await response.json()) as DocsListResponse;
        if (!response.ok || payload.status !== "ok") {
          const message = payload.status === "error" ? payload.message : "Failed to load docs.";
          throw new Error(message);
        }
        if (active) {
          setFiles(payload.files);
          const preferred = payload.files.find((file) => !isArchiveFile(file)) ?? payload.files[0] ?? null;
          setSelectedFileId(preferred?.id ?? null);
          setListError(null);
        }
      } catch (error) {
        if (active) setListError(error instanceof Error ? error.message : "Failed to load docs.");
      } finally {
        if (active) setListLoading(false);
      }
    };
    void loadList();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const loadDoc = async () => {
      if (!selectedFileId) {
        setContent("");
        setContentError(null);
        return;
      }
      try {
        setContentLoading(true);
        const response = await fetch(`/api/docs?file=${encodeURIComponent(selectedFileId)}`, { cache: "no-store" });
        const payload = (await response.json()) as DocContentResponse;
        if (!response.ok || payload.status !== "ok") {
          const message = payload.status === "error" ? payload.message : "Failed to load doc.";
          throw new Error(message);
        }
        if (active) {
          setContent(payload.content);
          setContentError(null);
        }
      } catch (error) {
        if (active) setContentError(error instanceof Error ? error.message : "Failed to load doc.");
      } finally {
        if (active) setContentLoading(false);
      }
    };
    void loadDoc();
    return () => { active = false; };
  }, [selectedFileId]);

  /* reset on doc change */
  useEffect(() => {
    setActiveHeadingId(null);
    setMobileTocOpen(false);
  }, [selectedFileId]);

  /* initial collapse state — restore from localStorage or compute defaults */
  const initializedRef = useRef(false);
  useEffect(() => {
    if (tree.length === 0 || initializedRef.current) return;
    initializedRef.current = true;

    // Try restoring from localStorage
    let restored = false;
    try {
      const savedFolders = localStorage.getItem("docs-collapsed-folders");
      const savedSections = localStorage.getItem("docs-collapsed-sections");
      const savedServices = localStorage.getItem("docs-collapsed-services");
      if (savedFolders) {
        setCollapsedFolders(new Set(JSON.parse(savedFolders) as string[]));
        restored = true;
      }
      if (savedSections) {
        setCollapsedSections(new Set(JSON.parse(savedSections) as string[]));
        restored = true;
      }
      if (savedServices) {
        setCollapsedServices(new Set(JSON.parse(savedServices) as string[]));
      }
    } catch { /* localStorage unavailable */ }

    if (!restored) {
      // Default: collapse all folders, open ancestors of selected file
      setCollapsedFolders((prev) => {
        const next = new Set(prev);
        for (const { root } of tree) {
          for (const fullPath of collectFolderPaths(root)) {
            next.add(fullPath);
          }
        }
        for (const fullPath of collectAncestorFolderPaths(selectedFile)) {
          next.delete(fullPath);
        }
        return next;
      });
      // Default: collapse all sections except the active one
      setCollapsedSections(() => {
        const next = new Set<string>();
        for (const { group, sections } of groupedTree) {
          for (const { section } of sections) {
            const key = getSectionKey(group, section);
            if (key !== activeSectionKey) next.add(key);
          }
        }
        return next;
      });
    }

    setActiveGroupTab((prev) => {
      if (prev) return prev;
      return activeGroup ?? groupedTree[0]?.group ?? null;
    });
  }, [tree, groupedTree, selectedFile, activeGroup, activeSectionKey]);

  /* ── scroll-spy ── */
  useEffect(() => {
    if (headings.length === 0) return;
    if (typeof IntersectionObserver === "undefined") return;
    const el = contentRef.current;
    if (!el) return;

    const headingElements = headings
      .map((h) => el.querySelector(`[id="${h.id}"]`))
      .filter(Boolean) as Element[];

    if (headingElements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) setActiveHeadingId(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 },
    );

    headingElements.forEach((hEl) => observer.observe(hEl));
    return () => observer.disconnect();
  }, [headings, content]);

  /* ── body scroll lock for mobile sidebar ── */
  useEffect(() => {
    if (mobileSidebarOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileSidebarOpen]);

  /* ── persist collapsed state ── */
  const persistTimerRef = useRef(0);
  useEffect(() => {
    // Skip persistence until initial state is loaded
    if (tree.length === 0) return;
    clearTimeout(persistTimerRef.current);
    persistTimerRef.current = window.setTimeout(() => {
      try {
        localStorage.setItem("docs-collapsed-folders", JSON.stringify([...collapsedFolders]));
        localStorage.setItem("docs-collapsed-sections", JSON.stringify([...collapsedSections]));
        localStorage.setItem("docs-collapsed-services", JSON.stringify([...collapsedServices]));
      } catch { /* localStorage unavailable */ }
    }, 300);
  }, [collapsedFolders, collapsedSections, collapsedServices, tree]);

  /* ── actions ── */
  const toggleFolder = useCallback((fullPath: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(fullPath)) next.delete(fullPath);
      else next.add(fullPath);
      return next;
    });
  }, []);

  const switchGroupTab = useCallback((group: string) => {
    setActiveGroupTab(group);
  }, []);

  const toggleSection = useCallback((group: string, section: string) => {
    const key = getSectionKey(group, section);
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleService = useCallback((service: string) => {
    setCollapsedServices((prev) => {
      const next = new Set(prev);
      if (next.has(service)) next.delete(service);
      else next.add(service);
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => {
    const allFolders = new Set<string>();
    for (const { root } of tree) {
      for (const fullPath of collectFolderPaths(root)) {
        allFolders.add(fullPath);
      }
    }
    setCollapsedFolders(allFolders);
    const allSections = new Set<string>();
    for (const { group, sections } of groupedTree) {
      for (const { section } of sections) {
        allSections.add(getSectionKey(group, section));
      }
    }
    setCollapsedSections(allSections);
    const allServices = new Set<string>();
    const extGroup = groupedTree.find(({ group }) => group === "cortana-external");
    if (extGroup) {
      for (const { section } of extGroup.sections) {
        const group = getSectionGroup(section);
        if (group === "cortana-external") {
          const service = section.replace(/^cortana-external /, "").split(" ")[0];
          if (service) allServices.add(service);
        }
      }
    }
    setCollapsedServices(allServices);
  }, [tree, groupedTree]);

  const expandAll = useCallback(() => {
    setCollapsedFolders(new Set());
    setCollapsedSections(new Set());
    setCollapsedServices(new Set());
  }, []);

  const selectFile = useCallback((id: string) => {
    setSelectedFileId(id);
    setMobileSidebarOpen(false);
  }, []);

  const resolvedGroupTab = activeGroupTab ?? groupedTree[0]?.group ?? null;
  const activeGroupSections = groupedTree.find(({ group }) => group === resolvedGroupTab)?.sections ?? [];

  return {
    files,
    selectedFile,
    selectedFileId,
    content,
    searchQuery,
    setSearchQuery,
    collapsedFolders,
    activeGroupTab: resolvedGroupTab,
    collapsedSections,
    collapsedServices,
    activeHeadingId,
    setActiveHeadingId,
    mobileSidebarOpen,
    setMobileSidebarOpen,
    mobileTocOpen,
    setMobileTocOpen,
    listLoading,
    contentLoading,
    listError,
    contentError,
    contentRef,
    tree,
    groupedTree,
    headings,
    breadcrumbs,
    activeGroupSections,
    toggleFolder,
    switchGroupTab,
    toggleSection,
    toggleService,
    selectFile,
    collapseAll,
    expandAll,
  };
}
