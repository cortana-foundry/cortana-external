export type StreamerConfiguredRole = "auto" | "leader" | "follower" | "disabled";
export type StreamerActiveRole = "leader" | "follower" | "disabled";

export function initialActiveStreamerRole(configuredRole: StreamerConfiguredRole): StreamerActiveRole {
  return configuredRole === "auto" ? "follower" : configuredRole;
}

export function shouldStartLeaderStreamer(options: {
  enabled: boolean;
  activeRole: StreamerActiveRole;
  hasStreamer: boolean;
  credentialsConfigured: boolean;
}): boolean {
  return options.enabled && options.activeRole === "leader" && !options.hasStreamer && options.credentialsConfigured;
}

export function shouldDemoteStreamerLeader(options: {
  activeRole: StreamerActiveRole;
  failurePolicy: string | null | undefined;
}): boolean {
  return options.activeRole === "leader" && options.failurePolicy === "max_connections_exceeded";
}
