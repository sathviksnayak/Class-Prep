type CreateFolderModalProps = {
  isOpen: boolean;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  error?: string | null;
  isPending?: boolean;
};

export function CreateFolderModal({
  isOpen,
  value,
  onChange,
  onClose,
  onSubmit,
  error,
  isPending = false,
}: CreateFolderModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1f2d27]/20 p-4">
      <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }} className="w-full max-w-md rounded-2xl border border-[#e4eae5] bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-lg font-semibold text-[#1f2d27]">Create folder</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-[#5a6a62] hover:bg-[#f3f7f4]"
          >
            ✕
          </button>
        </div>

        <label htmlFor="folder-name" className="mt-5 block text-sm font-medium text-[#1f2d27]">
          Folder name
        </label>
        <input
          id="folder-name"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoFocus
          disabled={isPending}
          placeholder="e.g. Chapter 3"
          className="mt-2 w-full rounded-xl border border-[#d8e0d9] bg-white px-3.5 py-2.5 text-sm text-[#1f2d27] outline-none transition placeholder:text-[#6a786f] focus:border-[#2f6f4b] focus:ring-2 focus:ring-[#dfeee5]"
        />

        {error ? <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-xl border border-[#d8e0d9] bg-white px-4 py-2 text-sm font-medium text-[#1f2d27] hover:bg-[#f5f8f6]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!value.trim() || isPending}
            className="rounded-xl bg-[#2f6f4b] px-4 py-2 text-sm font-medium text-white hover:bg-[#285d40] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}
