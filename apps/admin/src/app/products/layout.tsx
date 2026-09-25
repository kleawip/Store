"use client";

import { Shell } from "@/components/shell";
import { RequireSession } from "@/components/session";

export default function ProductsLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireSession>
      <Shell>{children}</Shell>
    </RequireSession>
  );
}
