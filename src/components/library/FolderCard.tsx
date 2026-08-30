type FolderCardProps = {
  name: string;
  itemCount: number;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
};

export function FolderCard({ name, itemCount, onOpen, onRename, onDelete }: FolderCardProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group rounded-2xl border border-[#dfe7e1] bg-white p-4 text-left shadow-sm shadow-[#edf3ee] transition-colors hover:border-[#bcd4c2] hover:bg-[#f7faf7]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#edf5f0] text-xl">📁</div>
          <div>
            <p className="text-base font-medium text-[#1f2d27]">{name}</p>
            <p className="mt-1 text-xs text-[#5a6a62]">{itemCount} items</p>
          </div>
        </div>
        <div className="relative">
          <div className="px-2 text-lg text-[#5a6a62]">⋮</div>
          <div className="absolute right-0 top-8 z-10 hidden min-w-[120px] rounded-xl border border-[#e4eae5] bg-white p-2 shadow-lg group-hover:block">
            <button type="button" onClick={(event) => { event.stopPropagation(); onRename(); }} className="block w-full rounded-lg px-2 py-1.5 text-left text-sm text-[#1f2d27] hover:bg-[#f3f7f4]">Rename</button>
            <button type="button" onClick={(event) => { event.stopPropagation(); onDelete(); }} className="block w-full rounded-lg px-2 py-1.5 text-left text-sm text-[#d14444] hover:bg-[#fff0f0]">Delete</button>
          </div>
        </div>
      </div>
    </button>
  );
}
