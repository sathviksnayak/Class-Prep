import type { ReactNode } from "react";

type HeaderProps = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
};

export function Header({ title, subtitle, action }: HeaderProps) {
  return (
    <header className="flex flex-col gap-4 border-b border-[#e4eae5] pb-6 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.14em] text-[#5a6a62]">Teacher platform</p>
        <h1 className="mt-2 text-2xl font-semibold text-[#1f2d27] md:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-2 text-sm text-[#5a6a62]">{subtitle}</p> : null}
      </div>
      {action ? <div>{action}</div> : null}
    </header>
  );
}
