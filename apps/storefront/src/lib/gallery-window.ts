export function galleryWindow(total: number, current: number, visibleCount = 4): number[] {
  if (total <= 0 || visibleCount <= 0) return [];
  const count = Math.min(total, visibleCount);
  const start = Math.max(0, Math.min(current - Math.floor(count / 2), total - count));
  return Array.from({ length: count }, (_, index) => start + index);
}
