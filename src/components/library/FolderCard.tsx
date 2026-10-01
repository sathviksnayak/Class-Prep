type FolderCardProps = {
  name: string;
  itemCount: number;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
};

export function FolderCard({ name, itemCount, onOpen, onRename, onDelete }: FolderCardProps) {
  return (
    <div className="group flex items-stretch rounded-2xl border border-[#dfe7e1] bg-white shadow-sm shadow-[#edf3ee] transition-colors hover:border-[#bcd4c2] hover:bg-[#f7faf7]">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 p-4 text-left">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#edf5f0] text-xl">📁</span>
        <span className="min-w-0">
          <span className="block truncate text-base font-medium text-[#1f2d27]">{name}</span>
          <span className="mt-1 block text-xs text-[#5a6a62]">{itemCount} items</span>
        </span>
      </button>
      <div className="relative flex items-start p-3">
        <button
          type="button"
          aria-label={`Actions for ${name}`}
          className="rounded-lg px-2 py-1 text-lg text-[#5a6a62] hover:bg-[#f3f7f4]"
        >
          ⋮
        </button>
        <div className="absolute right-2 top-10 z-10 hidden min-w-[120px] rounded-xl border border-[#e4eae5] bg-white p-2 shadow-lg group-hover:block group-focus-within:block">
          <button type="button" onClick={onRename} className="block w-full rounded-lg px-2 py-1.5 text-left text-sm text-[#1f2d27] hover:bg-[#f3f7f4]">Rename</button>
          <button type="button" onClick={onDelete} className="block w-full rounded-lg px-2 py-1.5 text-left text-sm text-[#d14444] hover:bg-[#fff0f0]">Delete</button>
        </div>
      </div>
    </div>
  );
}
