type BreadcrumbItem = {
  label: string;
  href?: string;
};

type BreadcrumbsProps = {
  items: BreadcrumbItem[];
  onNavigate: (href?: string) => void;
};

export function Breadcrumbs({ items, onNavigate }: BreadcrumbsProps) {
  return (
    <nav className="flex flex-wrap items-center gap-2 text-sm text-[#5a6a62]">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        return (
          <div key={`${item.label}-${index}`} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigate(item.href)}
              className={`transition-colors ${
                isLast ? "cursor-default font-medium text-[#1f2d27]" : "hover:text-[#2f6f4b]"
              }`}
              disabled={isLast}
            >
              {item.label}
            </button>
            {!isLast ? <span>/</span> : null}
          </div>
        );
      })}
    </nav>
  );
}
