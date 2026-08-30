import { Button } from "@/components/Button";

type PaperRow = {
  title: string;
  className: string;
  subject: string;
  date: string;
  marks: string;
};

type PaperTableProps = {
  papers: PaperRow[];
};

export function PaperTable({ papers }: PaperTableProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#e4eae5] bg-white shadow-sm shadow-[#edf3ee]">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left">
          <thead className="bg-[#f5f8f6] text-sm text-[#5a6a62]">
            <tr>
              <th className="px-5 py-3 font-medium">Paper</th>
              <th className="px-5 py-3 font-medium">Class</th>
              <th className="px-5 py-3 font-medium">Subject</th>
              <th className="px-5 py-3 font-medium">Date</th>
              <th className="px-5 py-3 font-medium">Marks</th>
              <th className="px-5 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf0ee] text-sm text-[#1f2d27]">
            {papers.map((paper) => (
              <tr key={`${paper.title}-${paper.date}`}>
                <td className="px-5 py-4 font-medium">{paper.title}</td>
                <td className="px-5 py-4">{paper.className}</td>
                <td className="px-5 py-4">{paper.subject}</td>
                <td className="px-5 py-4">{paper.date}</td>
                <td className="px-5 py-4">{paper.marks}</td>
                <td className="px-5 py-4">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" className="px-3 py-1.5 text-xs">
                      View
                    </Button>
                    <Button variant="secondary" className="px-3 py-1.5 text-xs">
                      Edit
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
