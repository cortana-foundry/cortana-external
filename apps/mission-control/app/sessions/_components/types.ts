export type CodexSession = {
  sessionId: string;
  threadName: string | null;
  updatedAt: number | null;
  cwd: string | null;
  model: string | null;
  source: string | null;
  cliVersion: string | null;
  lastMessagePreview: string | null;
  transcriptPath: string | null;
};

export type CodexSessionGroup = {
  id: string;
  label: string;
  rootPath: string;
  isActive: boolean;
  isCollapsed: boolean;
  sessions: CodexSession[];
};

export type CodexSessionEvent = {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number | null;
  phase: string | null;
  rawType: string;
};

export type CodexSessionDetail = CodexSession & {
  events: CodexSessionEvent[];
};

export type StreamingCodexEvent = {
  id: string;
  role: "assistant";
  text: string;
};

export type CodexSessionsResponse = {
  sessions: CodexSession[];
  groups: CodexSessionGroup[];
  latestUpdatedAt: number | null;
  totalMatchedSessions: number;
  totalVisibleSessions: number;
  error?: string;
};

export type CodexSessionDetailResponse = {
  session?: CodexSessionDetail;
  error?: string;
};

export type CodexStreamEnvelope = {
  event: string;
  data: unknown;
};
