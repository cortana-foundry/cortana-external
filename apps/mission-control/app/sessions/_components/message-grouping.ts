export type Message = {
  role: "user" | "assistant";
  timestamp: number | null;
};

const GROUPING_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

export function shouldShowHeader(
  current: Message,
  previous: Message | null
): boolean {
  // First message always shows header
  if (previous === null) {
    return true;
  }

  // Different roles always get a header
  if (previous.role !== current.role) {
    return true;
  }

  // Same role, missing timestamps: conservative default is to show header
  if (!previous.timestamp || !current.timestamp) {
    return true;
  }

  // Same role with both timestamps: check if within threshold
  const timeDiff = Math.abs(current.timestamp - previous.timestamp);
  return timeDiff > GROUPING_THRESHOLD_MS;
}
