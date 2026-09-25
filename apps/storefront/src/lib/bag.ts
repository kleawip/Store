export type BagLine = { productId: string; quantity: number };

export function addLine(lines: BagLine[], productId: string, quantity = 1): BagLine[] {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return lines;
  const existing = lines.find((line) => line.productId === productId);
  if (!existing) return [...lines, { productId, quantity }];
  return lines.map((line) => line.productId === productId ? { ...line, quantity: Math.min(99, line.quantity + quantity) } : line);
}

export function changeQuantity(lines: BagLine[], productId: string, quantity: number): BagLine[] {
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 99) return lines;
  if (quantity === 0) return lines.filter((line) => line.productId !== productId);
  return lines.map((line) => line.productId === productId ? { ...line, quantity } : line);
}

export function validBagLines(value: unknown, knownProductIds?: ReadonlySet<string>): BagLine[] {
  if (!Array.isArray(value)) return [];
  const lines: BagLine[] = [];
  for (const line of value) {
    if (typeof line !== "object" || line === null ||
      typeof line.productId !== "string" || line.productId.trim() === "" ||
      (knownProductIds && !knownProductIds.has(line.productId)) ||
      !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) continue;
    const existing = lines.find((item) => item.productId === line.productId);
    if (existing) existing.quantity = Math.min(99, existing.quantity + line.quantity);
    else lines.push({ productId: line.productId, quantity: line.quantity });
  }
  return lines;
}
