"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";

type ShellGateProps = {
  children: ReactNode;
};

export function ShellGate({ children }: ShellGateProps) {
  const pathname = usePathname();
  const isLoginRoute = pathname === "/login";

  if (isLoginRoute) {
    return <>{children}</>;
  }

  return <AppShell>{children}</AppShell>;
}
