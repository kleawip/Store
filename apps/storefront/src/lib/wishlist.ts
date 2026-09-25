export function validWishlistIds(value: unknown, knownProductIds: ReadonlySet<string>): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string =>
    typeof id === "string" && knownProductIds.has(id)
  ))];
}
