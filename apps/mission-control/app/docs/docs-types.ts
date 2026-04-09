export type DocFile = { id: string; name: string; path: string; section: string };

export type DocsListResponse =
  | { status: "ok"; files: DocFile[] }
  | { status: "error"; message: string };

export type DocContentResponse =
  | { status: "ok"; name: string; content: string }
  | { status: "error"; message: string };

export type TreeNode = {
  name: string;
  fullPath: string;
  children: TreeNode[];
  files: DocFile[];
};

export type SectionTree = {
  section: string;
  root: TreeNode;
};

export type SectionGroup = {
  group: string;
  sections: SectionTree[];
};
