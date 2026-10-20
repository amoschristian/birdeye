export function formatRelativeTime(timestampSeconds: number, nowSeconds = Date.now() / 1000): string {
  const diff = nowSeconds - timestampSeconds;

  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d`;

  return new Date(timestampSeconds * 1000).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

export function formatDuration(ms: number): string {
  if (!ms || ms < 0) return "0:00";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
