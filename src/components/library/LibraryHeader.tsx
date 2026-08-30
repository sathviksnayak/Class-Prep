import type { ReactNode } from "react";

type LibraryHeaderProps = {
  title: string;
  subtitle: string;
  actions?: ReactNode;
};

export function LibraryHeader({ title, subtitle, actions }: LibraryHeaderProps) {
  return (
    <div className="flex flex-col gap-4 border-b border-[#e4eae5] pb-6 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#5a6a62]">Teacher library</p>
        <h1 className="mt-2 text-2xl font-semibold text-[#1f2d27] md:text-3xl">{title}</h1>
        <p className="mt-2 text-sm text-[#5a6a62]">{subtitle}</p>
      </div>
      {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
    </div>
  );
}
