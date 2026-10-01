import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { LibraryClient } from "./LibraryClient";

export const dynamic = "force-dynamic";

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ folder?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id;
  const { folder: requestedFolderId } = await searchParams;
  let currentFolderId: string | null = null;
  let breadcrumbs = [{ id: "root", name: "My Library" }];
  if (requestedFolderId) {
    const path: { id: string; name: string; parentId: string | null }[] = [];
    let cursor: string | null = requestedFolderId;
    while (cursor) {
      const folder: { id: string; name: string; parentId: string | null; userId: string } | null = await prisma.folder.findUnique({ where: { id: cursor }, select: { id: true, name: true, parentId: true, userId: true } });
      if (!folder || folder.userId !== userId) { path.length = 0; break; }
      path.unshift({ id: folder.id, name: folder.name, parentId: folder.parentId });
      cursor = folder.parentId;
    }
    if (path.length) {
      currentFolderId = requestedFolderId;
      breadcrumbs = [...breadcrumbs, ...path.map(({ id, name }) => ({ id, name }))];
    }
  }

  // Load root-level folders and documents (parentId = null, folderId = null)
  const [folders, documents] = await Promise.all([
    prisma.folder.findMany({
      where: { userId, parentId: currentFolderId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, parentId: true, createdAt: true, updatedAt: true, _count: { select: { documents: true, childFolders: true } } },
    }),
    prisma.document.findMany({
      where: { userId, folderId: currentFolderId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, size: true, folderId: true, createdAt: true, updatedAt: true },
    }),
  ]);

  return (
    <LibraryClient
      initialFolders={folders}
      initialDocuments={documents}
      initialFolderId={currentFolderId}
      initialBreadcrumbs={breadcrumbs}
    />
  );
}
