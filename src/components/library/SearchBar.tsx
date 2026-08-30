type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

export function SearchBar({ value, onChange, placeholder = "Search documents..." }: SearchBarProps) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-[#dfe7e1] bg-white px-3.5 py-2.5 shadow-sm shadow-[#edf3ee]">
      <span className="text-[#5a6a62]">⌕</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent text-sm text-[#1f2d27] outline-none placeholder:text-[#6a786f]"
      />
    </div>
  );
}
