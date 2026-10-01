"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin, STORAGE_BUCKET, assertPrivateStorageBucket, buildStoragePath } from "@/lib/supabase";

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};
const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
const MAX_NAME_LENGTH = 255;

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("UNAUTHORIZED");
  }
  return session.user.id;
}

// ─── Folder Actions ───────────────────────────────────────────────────────────

export async function getFolders(parentId: string | null) {
  const userId = await requireUser();
  return prisma.folder.findMany({
    where: { userId, parentId: parentId ?? null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, parentId: true, createdAt: true, updatedAt: true, _count: { select: { documents: true, childFolders: true } } },
  });
}

export async function createFolder(name: string, parentId: string | null) {
  const userId = await requireUser();

  const normalizedName = name.trim();
  if (!normalizedName) throw new Error("Folder name cannot be empty");
  if (normalizedName.length > MAX_NAME_LENGTH || /[\\/\u0000-\u001f]/.test(normalizedName)) {
    throw new Error("Folder name is invalid or too long");
  }

  // If a parentId was specified, verify it belongs to this user
  if (parentId) {
    const parent = await prisma.folder.findUnique({ where: { id: parentId } });
    if (!parent || parent.userId !== userId) throw new Error("PARENT_NOT_FOUND");
  }

  const folder = await prisma.folder.create({
    data: { name: normalizedName, parentId: parentId ?? null, userId },
    select: { id: true, name: true, parentId: true, createdAt: true, updatedAt: true },
  });

  revalidatePath("/library");
  return folder;
}

export async function renameFolder(folderId: string, newName: string) {
  const userId = await requireUser();
  const normalizedName = newName.trim();
  if (!normalizedName) throw new Error("Folder name cannot be empty");
  if (normalizedName.length > MAX_NAME_LENGTH || /[\\/\u0000-\u001f]/.test(normalizedName)) {
    throw new Error("Folder name is invalid or too long");
  }

  const existing = await prisma.folder.findUnique({ where: { id: folderId } });
  if (!existing || existing.userId !== userId) throw new Error("NOT_FOUND");

  const folder = await prisma.folder.update({
    where: { id: folderId },
    data: { name: normalizedName },
    select: { id: true, name: true, parentId: true, createdAt: true, updatedAt: true },
  });

  revalidatePath("/library");
  return folder;
}

export async function deleteFolder(folderId: string) {
  const userId = await requireUser();
  const folder = await prisma.folder.findUnique({ where: { id: folderId } });
  if (!folder || folder.userId !== userId) throw new Error("NOT_FOUND");

  // Collect all storage paths for documents inside this folder tree
  const allDocs = await getAllDocumentsInFolderTree(folderId, userId);
  const storagePaths = allDocs.map((d) => d.storagePath);

  // Delete storage objects in batch
  if (storagePaths.length > 0) {
    await assertPrivateStorageBucket();
    const { error } = await supabaseAdmin.storage.from(STORAGE_BUCKET).remove(storagePaths);
    if (error) {
      console.error("[deleteFolder] Storage deletion error:", error.message);
      throw new Error("Could not delete folder contents from storage. Please try again.");
    }
  }

  // Cascade deletes child folders + documents via Prisma FK cascade
  await prisma.folder.delete({ where: { id: folderId } });

  revalidatePath("/library");
}

async function getAllDocumentsInFolderTree(
  folderId: string,
  userId: string
): Promise<{ storagePath: string }[]> {
  const docs = await prisma.document.findMany({
    where: { folderId, userId },
    select: { storagePath: true },
  });

  const children = await prisma.folder.findMany({
    where: { parentId: folderId, userId },
    select: { id: true },
  });

  const childDocs = await Promise.all(
    children.map((c) => getAllDocumentsInFolderTree(c.id, userId))
  );

  return [...docs, ...childDocs.flat()];
}

// ─── Document Actions ─────────────────────────────────────────────────────────

export async function getDocuments(folderId: string | null) {
  const userId = await requireUser();
  return prisma.document.findMany({
    where: { userId, folderId: folderId ?? null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, type: true, size: true, folderId: true, createdAt: true, updatedAt: true },
  });
}

export async function uploadDocument(formData: FormData) {
  const userId = await requireUser();

  const file = formData.get("file") as File | null;
  const folderId = (formData.get("folderId") as string | null) || null;

  if (!file || file.size === 0) throw new Error("No file provided");
  if (file.size > MAX_SIZE_BYTES) throw new Error("File exceeds the 20 MB limit");

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const expectedMime = MIME_BY_EXTENSION[ext];
  if (!expectedMime) {
    throw new Error("Only PDF and DOCX files are supported");
  }
  if (file.type && file.type !== expectedMime) {
    throw new Error("The file type does not match its extension");
  }
  const safeName = file.name.trim();
  if (!safeName || safeName.length > MAX_NAME_LENGTH || /[\\/\u0000-\u001f]/.test(safeName)) {
    throw new Error("The file name is invalid or too long");
  }

  // Verify folder ownership if provided
  if (folderId) {
    const folder = await prisma.folder.findUnique({ where: { id: folderId } });
    if (!folder || folder.userId !== userId) throw new Error("FOLDER_NOT_FOUND");
  }

  const duplicate = await prisma.document.findFirst({
    where: { userId, folderId, name: { equals: safeName, mode: "insensitive" } },
    select: { id: true },
  });
  if (duplicate) throw new Error("A document with this name already exists in this folder");

  const storagePath = buildStoragePath(userId, folderId, safeName);
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const hasValidSignature = ext === "pdf"
    ? buffer.subarray(0, 5).toString("ascii") === "%PDF-"
    : buffer[0] === 0x50 && buffer[1] === 0x4b;
  if (!hasValidSignature) {
    throw new Error(`The selected file is not a valid ${ext.toUpperCase()} document`);
  }

  await assertPrivateStorageBucket();

  const { error: uploadError } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, buffer, {
      contentType: expectedMime,
      upsert: false,
    });

  if (uploadError) {
    console.error("[uploadDocument] Storage upload error:", uploadError.message);
    throw new Error("Failed to upload file to storage");
  }

  let document;
  try {
    document = await prisma.document.create({
      data: {
        name: safeName,
        type: ext,
        size: file.size,
        storagePath,
        folderId: folderId ?? null,
        userId,
      },
    });
  } catch (dbError) {
    // Rollback storage upload if DB insert fails
    await supabaseAdmin.storage.from(STORAGE_BUCKET).remove([storagePath]);
    console.error("[uploadDocument] DB error after storage upload:", dbError);
    throw new Error("Failed to save document record");
  }

  revalidatePath("/library");
  return {
    id: document.id,
    name: document.name,
    type: document.type,
    size: document.size,
    folderId: document.folderId,
    createdAt: document.createdAt,
  };
}

export async function getDocumentSignedUrl(documentId: string) {
  const userId = await requireUser();

  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc || doc.userId !== userId) throw new Error("NOT_FOUND");

  await assertPrivateStorageBucket();
  const { data, error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(doc.storagePath, 60 * 5); // 5-minute signed URL

  if (error || !data?.signedUrl) {
    console.error("[getDocumentSignedUrl] Error:", error?.message);
    throw new Error("Failed to generate download link");
  }

  return data.signedUrl;
}

export async function renameDocument(documentId: string, newName: string) {
  const userId = await requireUser();
  const normalizedName = newName.trim();
  if (!normalizedName) throw new Error("Document name cannot be empty");
  if (normalizedName.length > MAX_NAME_LENGTH || /[\\/\u0000-\u001f]/.test(normalizedName)) {
    throw new Error("Document name is invalid or too long");
  }

  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc || doc.userId !== userId) throw new Error("NOT_FOUND");

  const duplicate = await prisma.document.findFirst({
    where: {
      userId,
      folderId: doc.folderId,
      id: { not: documentId },
      name: { equals: normalizedName, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (duplicate) throw new Error("A document with this name already exists in this folder");

  const updated = await prisma.document.update({
    where: { id: documentId },
    data: { name: normalizedName },
    select: { id: true, name: true, type: true, size: true, folderId: true, createdAt: true, updatedAt: true },
  });

  revalidatePath("/library");
  return updated;
}

export async function deleteDocument(documentId: string) {
  const userId = await requireUser();

  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc || doc.userId !== userId) throw new Error("NOT_FOUND");

  // 1. Delete from storage
  await assertPrivateStorageBucket();
  const { error: storageError } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .remove([doc.storagePath]);

  if (storageError) {
    console.error("[deleteDocument] Storage delete error:", storageError.message);
    throw new Error("Could not delete the file from storage. Please try again.");
  }

  // 2. Delete DB record
  await prisma.document.delete({ where: { id: documentId } });

  revalidatePath("/library");
}

// ─── Breadcrumb helpers ───────────────────────────────────────────────────────

export async function getFolderAncestors(folderId: string) {
  const userId = await requireUser();
  const path: { id: string; name: string }[] = [];

  let currentId: string | null = folderId;
  while (currentId) {
    const folder: { id: string; name: string; parentId: string | null; userId: string } | null =
      await prisma.folder.findUnique({
        where: { id: currentId },
        select: { id: true, name: true, parentId: true, userId: true },
      });
    if (!folder || folder.userId !== userId) throw new Error("NOT_FOUND");
    path.unshift({ id: folder.id, name: folder.name });
    currentId = folder.parentId;
  }

  return path;
}
