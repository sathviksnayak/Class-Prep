type EmptyStateProps = {
  title: string;
  description: string;
};

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="rounded-2xl border border-dashed border-[#cfe0d4] bg-[#f7faf7] px-6 py-10 text-center">
      <p className="text-lg font-medium text-[#1f2d27]">{title}</p>
      <p className="mt-2 text-sm text-[#5a6a62]">{description}</p>
    </div>
  );
}
