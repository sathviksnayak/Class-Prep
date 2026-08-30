type DocumentCardProps = {
  name: string;
  type: string;
  size: string;
  uploadedAt: string;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
};

const typeMeta: Record<string, { icon: string; bg: string }> = {
  pdf: { icon: "PDF", bg: "bg-[#fbe9e9] text-[#b53838]" },
  docx: { icon: "DOCX", bg: "bg-[#eef4ff] text-[#355dcd]" },
  txt: { icon: "TXT", bg: "bg-[#edf5f0] text-[#2f6f4b]" },
  default: { icon: "FILE", bg: "bg-[#edf5f0] text-[#2f6f4b]" },
};

export function DocumentCard({ name, type, size, uploadedAt, onOpen, onRename, onDelete }: DocumentCardProps) {
  const meta = typeMeta[type.toLowerCase()] ?? typeMeta.default;

  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-[#e4eae5] bg-white px-4 py-3 shadow-sm shadow-[#edf3ee]">
      <div className="flex min-w-0 items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl text-[10px] font-semibold ${meta.bg}`}>
          {meta.icon}
        </div>
        <div className="min-w-0">
          <button type="button" onClick={onOpen} className="truncate text-sm font-medium text-[#1f2d27] hover:text-[#2f6f4b]">
            {name}
          </button>
          <p className="mt-1 text-xs text-[#5a6a62]">Uploaded {uploadedAt}</p>
        </div>
      </div>

      <div className="hidden items-center gap-6 text-sm text-[#5a6a62] md:flex">
        <span className="w-12 text-center font-medium text-[#1f2d27]">{type.toUpperCase()}</span>
        <span className="w-16 text-right">{size}</span>
      </div>

      <div className="flex items-center gap-2">
        <button type="button" onClick={onOpen} className="rounded-lg px-2 py-1 text-sm text-[#2f6f4b] hover:bg-[#edf5f0]">
          Open
        </button>
        <div className="group relative">
          <button type="button" className="rounded-lg px-2 py-1 text-lg text-[#5a6a62] hover:bg-[#f3f7f4]">
            ⋮
          </button>
          <div className="absolute right-0 top-8 z-10 hidden min-w-[120px] rounded-xl border border-[#e4eae5] bg-white p-2 shadow-lg group-hover:block">
            <button type="button" onClick={onRename} className="block w-full rounded-lg px-2 py-1.5 text-left text-sm text-[#1f2d27] hover:bg-[#f3f7f4]">Rename</button>
            <button type="button" onClick={onDelete} className="block w-full rounded-lg px-2 py-1.5 text-left text-sm text-[#d14444] hover:bg-[#fff0f0]">Delete</button>
          </div>
        </div>
      </div>
    </div>
  );
}
