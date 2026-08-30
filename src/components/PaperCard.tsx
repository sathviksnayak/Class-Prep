type PaperCardProps = {
  title: string;
  className: string;
  subject: string;
  marks: string;
  updatedAt: string;
};

export function PaperCard({ title, className, subject, marks, updatedAt }: PaperCardProps) {
  return (
    <div className="rounded-2xl border border-[#e4eae5] bg-white p-4 shadow-sm shadow-[#edf3ee]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#1f2d27]">{title}</p>
          <p className="mt-1 text-xs uppercase tracking-[0.12em] text-[#5a6a62]">{className}</p>
        </div>
        <span className="rounded-full bg-[#edf5f0] px-2.5 py-1 text-xs font-medium text-[#2f6f4b]">
          {marks}
        </span>
      </div>
      <div className="mt-6 flex items-center justify-between text-xs text-[#5a6a62]">
        <span>{subject}</span>
        <span>{updatedAt}</span>
      </div>
    </div>
  );
}
