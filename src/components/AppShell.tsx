import { Sidebar } from "@/components/Sidebar";

type AppShellProps = {
  children: React.ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-[#f5f8f6] text-[#1f2d27]">
      <Sidebar />
      <div className="flex-1">{children}</div>
    </div>
  );
}
