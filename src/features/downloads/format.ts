/** "24 MB", "1.5 KB", "1.2 GB": one decimal below 10, none above. */
export function formatSize(bytes: number): string {
  let n = Math.max(0, Number(bytes) || 0);
  if (n < 1024) return `${Math.round(n)} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < units.length - 1);
  const v = n < 10 ? Math.round(n * 10) / 10 : Math.round(n);
  return `${v} ${units[i]}`;
}
