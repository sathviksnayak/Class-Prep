type StatCardProps = {
  label: string;
  value: string;
  detail: string;
};

export function StatCard({ label, value, detail }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-[#e4eae5] bg-white p-5 shadow-sm shadow-[#edf3ee]">
      <p className="text-sm text-[#5a6a62]">{label}</p>
      <p className="mt-4 text-3xl font-semibold text-[#1f2d27]">{value}</p>
      <p className="mt-2 text-sm text-[#5a6a62]">{detail}</p>
    </div>
  );
}
