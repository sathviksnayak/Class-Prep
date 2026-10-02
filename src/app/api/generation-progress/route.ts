import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const userId = (await auth())?.user?.id;
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Invalid generation id." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const record = await prisma.generatedPaper.findFirst({ where: { id, userId }, select: { status: true, validation: true } });
  if (!record) return Response.json({ phase: "preparing", completedBatches: 0, totalBatches: 0, groups: [] }, { headers: { "Cache-Control": "no-store" } });
  const validation = record.validation as { phase?: string; completedBatches?: number; totalBatches?: number; groups?: { groupId: string; resourceId: string; passed: boolean; errors: string[] }[]; generationError?: string };
  return Response.json({ status: record.status, phase: validation.phase ?? record.status, completedBatches: validation.completedBatches ?? 0, totalBatches: validation.totalBatches ?? 0, groups: validation.groups ?? [], error: validation.generationError }, { headers: { "Cache-Control": "no-store" } });
}
