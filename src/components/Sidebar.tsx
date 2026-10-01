"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const navItems = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Library", href: "/library" },
  { label: "Create Test", href: "/generate" },
  { label: "My Papers", href: "/papers" },
  { label: "Settings", href: "/settings" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden min-h-screen w-72 border-r border-[#e4eae5] bg-[#f7faf7] p-6 lg:flex lg:flex-col">
      <div className="mb-10 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2f6f4b] text-base font-semibold text-white">
          C
        </div>
        <div>
          <p className="text-lg font-semibold text-[#1f2d27]">ClassPrep</p>
        </div>
      </div>

      <nav className="space-y-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-[#e7f1ea] text-[#1f5d3d]"
                  : "text-[#485b53] hover:bg-[#edf3ee] hover:text-[#1f2d27]"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto rounded-2xl border border-[#dfe7e1] bg-white p-4">
        <p className="text-xs uppercase tracking-[0.12em] text-[#5a6a62]">My Papers</p>
        <p className="mt-2 text-sm text-[#5a6a62]">Your generated paper history will appear here when available.</p>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="mt-4 w-full rounded-xl border border-[#d8e0d9] px-3 py-2 text-sm font-medium text-[#485b53] hover:bg-[#f5f8f6]"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
