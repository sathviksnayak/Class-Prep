"use client";

import { type ChangeEvent, useRef, useState, useTransition } from "react";
import { Button } from "@/components/Button";
import { Breadcrumbs } from "@/components/library/Breadcrumbs";
import { CreateFolderModal } from "@/components/library/CreateFolderModal";
import { DocumentList } from "@/components/library/DocumentList";
import { EmptyState } from "@/components/library/EmptyState";
import { FolderGrid } from "@/components/library/FolderGrid";
import { LibraryHeader } from "@/components/library/LibraryHeader";
import { SearchBar } from "@/components/library/SearchBar";
import {
  createFolder,
  deleteDocument,
  deleteFolder,
  getFolderAncestors,
  getFolders,
  getDocuments,
  getDocumentSignedUrl,
  renameDocument,
  renameFolder,
  uploadDocument,
} from "./actions";

type FolderRow = { id: string; name: string; parentId: string | null; createdAt: Date; updatedAt: Date };
type DocumentRow = { id: string; name: string; type: string; size: number; folderId: string | null; createdAt: Date; updatedAt: Date };
type BreadcrumbEntry = { id: string; name: string };

type Props = {
  initialFolders: FolderRow[];
  initialDocuments: DocumentRow[];
};

export function LibraryClient({ initialFolders, initialDocuments }: Props) {
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbEntry[]>([{ id: "root", name: "My Library" }]);
  const [folders, setFolders] = useState<FolderRow[]>(initialFolders);
  const [documents, setDocuments] = useState<DocumentRow[]>(initialDocuments);
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const clearError = () => setError(null);

  async function refreshCurrent(folderId: string | null) {
    const [newFolders, newDocs] = await Promise.all([
      getFolders(folderId),
      getDocuments(folderId),
    ]);
    setFolders(newFolders as FolderRow[]);
    setDocuments(newDocs as DocumentRow[]);
  }

  const navigateToFolder = (folderId: string) => {
    startTransition(async () => {
      try {
        const ancestors = await getFolderAncestors(folderId);
        setBreadcrumbs([{ id: "root", name: "My Library" }, ...ancestors]);
        setCurrentFolderId(folderId);
        await refreshCurrent(folderId);
        setSearchTerm("");
      } catch {
        setError("Failed to open folder");
      }
    });
  };

  const navigateToBreadcrumb = (folderId: string | null) => {
    startTransition(async () => {
      try {
        if (!folderId || folderId === "root") {
          setBreadcrumbs([{ id: "root", name: "My Library" }]);
          setCurrentFolderId(null);
          await refreshCurrent(null);
        } else {
          const ancestors = await getFolderAncestors(folderId);
          setBreadcrumbs([{ id: "root", name: "My Library" }, ...ancestors]);
          setCurrentFolderId(folderId);
          await refreshCurrent(folderId);
        }
        setSearchTerm("");
      } catch {
        setError("Navigation failed");
      }
    });
  };

  const handleCreateFolder = () => {
    const name = newFolderName.trim();
    if (!name) return;
    startTransition(async () => {
      try {
        await createFolder(name, currentFolderId);
        await refreshCurrent(currentFolderId);
        setNewFolderName("");
        setIsCreateModalOpen(false);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to create folder");
      }
    });
  };

  const handleRenameFolder = (folderId: string) => {
    const folder = folders.find((f) => f.id === folderId);
    if (!folder) return;
    const nextName = window.prompt("Rename folder", folder.name);
    if (!nextName?.trim()) return;
    startTransition(async () => {
      try {
        await renameFolder(folderId, nextName.trim());
        await refreshCurrent(currentFolderId);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to rename folder");
      }
    });
  };

  const handleDeleteFolder = (folderId: string) => {
    const folder = folders.find((f) => f.id === folderId);
    if (!folder) return;
    if (!window.confirm(`Delete "${folder.name}" and all its contents?`)) return;
    startTransition(async () => {
      try {
        await deleteFolder(folderId);
        await refreshCurrent(currentFolderId);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to delete folder");
      }
    });
  };

  const handleUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    startTransition(async () => {
      clearError();
      const results: string[] = [];
      for (const file of Array.from(files)) {
        setUploadProgress(`Uploading ${file.name}…`);
        const fd = new FormData();
        fd.append("file", file);
        fd.append("folderId", currentFolderId ?? "");
        try {
          await uploadDocument(fd);
          results.push(`✓ ${file.name}`);
        } catch (e: unknown) {
          results.push(`✗ ${file.name}: ${e instanceof Error ? e.message : "upload failed"}`);
        }
      }
      setUploadProgress(null);
      await refreshCurrent(currentFolderId);
      // Show errors if any
      const failures = results.filter((r) => r.startsWith("✗"));
      if (failures.length > 0) setError(failures.join("\n"));
    });

    e.target.value = "";
  };

  const handleRenameDocument = (documentId: string) => {
    const doc = documents.find((d) => d.id === documentId);
    if (!doc) return;
    const nextName = window.prompt("Rename document", doc.name);
    if (!nextName?.trim()) return;
    startTransition(async () => {
      try {
        await renameDocument(documentId, nextName.trim());
        await refreshCurrent(currentFolderId);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to rename document");
      }
    });
  };

  const handleDeleteDocument = (documentId: string) => {
    const doc = documents.find((d) => d.id === documentId);
    if (!doc) return;
    if (!window.confirm(`Delete "${doc.name}"?`)) return;
    startTransition(async () => {
      try {
        await deleteDocument(documentId);
        await refreshCurrent(currentFolderId);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to delete document");
      }
    });
  };

  const handleOpenDocument = (documentId: string) => {
    // Open synchronously in the click handler so browsers do not block the
    // later navigation as a popup after the signed-URL Server Action returns.
    const openedTab = window.open("about:blank", "_blank");
    if (openedTab) openedTab.opener = null;

    startTransition(async () => {
      try {
        if (!openedTab) throw new Error("Allow pop-ups to open this document");
        const url = await getDocumentSignedUrl(documentId);
        openedTab.location.href = url;
      } catch (e: unknown) {
        openedTab?.close();
        setError(e instanceof Error ? e.message : "Failed to open document");
      }
    });
  };

  const filteredFolders = searchTerm.trim()
    ? folders.filter((f) => f.name.toLowerCase().includes(searchTerm.toLowerCase()))
    : folders;

  const filteredDocuments = searchTerm.trim()
    ? documents.filter((d) => d.name.toLowerCase().includes(searchTerm.toLowerCase()))
    : documents;

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (date: Date) =>
    new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const hasItems = folders.length > 0 || documents.length > 0;

  return (
    <div className="flex min-h-screen bg-[#f5f8f6]">
      <div className="flex-1 p-4 md:p-8">
        <div className="mx-auto max-w-6xl">
          <LibraryHeader
            title="My Library"
            subtitle="Organize your teaching materials in one place."
            actions={
              <>
                <SearchBar value={searchTerm} onChange={setSearchTerm} />
                <Button
                  variant="secondary"
                  onClick={() => { clearError(); setIsCreateModalOpen(true); }}
                  className="whitespace-nowrap"
                  disabled={isPending}
                >
                  + New Folder
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx"
                  multiple
                  onChange={handleUpload}
                  className="hidden"
                />
                <Button
                  onClick={() => { clearError(); fileInputRef.current?.click(); }}
                  className="whitespace-nowrap"
                  disabled={isPending}
                >
                  {uploadProgress ? "Uploading…" : "Upload"}
                </Button>
              </>
            }
          />

          {/* Status / Error bar */}
          {(error || uploadProgress || isPending) && (
            <div className={`mt-4 rounded-2xl px-4 py-3 text-sm ${error ? "bg-red-50 text-red-700 border border-red-200" : "bg-[#e7f1ea] text-[#1f5d3d]"}`}>
              {error ? (
                <div className="flex items-center justify-between">
                  <span>{error}</span>
                  <button onClick={clearError} className="ml-4 font-medium underline">Dismiss</button>
                </div>
              ) : uploadProgress || "Loading…"}
            </div>
          )}

          <div className="mt-6">
            <Breadcrumbs
              items={breadcrumbs.map((b) => ({
                label: b.name,
                href: b.id === "root" ? undefined : b.id,
              }))}
              onNavigate={(id) => navigateToBreadcrumb(id ?? null)}
            />
          </div>

          <div className="mt-8 rounded-3xl border border-[#e4eae5] bg-white p-6 shadow-sm shadow-[#edf3ee] md:p-8">
            {!hasItems && !searchTerm ? (
              <EmptyState
                title="This folder is empty"
                description="Create a folder or upload a PDF/DOCX to begin organizing your materials."
              />
            ) : null}

            {(filteredFolders.length > 0 || filteredDocuments.length > 0) ? (
              <>
                {filteredFolders.length > 0 && (
                  <section>
                    <h2 className="mb-4 text-lg font-semibold text-[#1f2d27]">Folders</h2>
                    <FolderGrid
                      folders={filteredFolders.map((f) => ({
                        id: f.id,
                        name: f.name,
                        itemCount: 0, // count not fetched per folder for performance
                      }))}
                      onOpenFolder={(id) => {
                        const f = folders.find((x) => x.id === id);
                        if (f) navigateToFolder(f.id);
                      }}
                      onRenameFolder={handleRenameFolder}
                      onDeleteFolder={handleDeleteFolder}
                    />
                  </section>
                )}

                {filteredDocuments.length > 0 && (
                  <section className={filteredFolders.length > 0 ? "mt-8" : "mt-0"}>
                    <h2 className="mb-4 text-lg font-semibold text-[#1f2d27]">Documents</h2>
                    <DocumentList
                      documents={filteredDocuments.map((d) => ({
                        id: d.id,
                        name: d.name,
                        type: d.type,
                        size: formatSize(d.size),
                        uploadedAt: formatDate(d.createdAt),
                      }))}
                      onOpenDocument={handleOpenDocument}
                      onRenameDocument={handleRenameDocument}
                      onDeleteDocument={handleDeleteDocument}
                    />
                  </section>
                )}

                {filteredFolders.length === 0 && filteredDocuments.length === 0 && searchTerm && (
                  <div className="mt-6">
                    <EmptyState title="No matching items" description="Try a different keyword." />
                  </div>
                )}
              </>
            ) : hasItems && searchTerm ? (
              <EmptyState title="No matching items" description="Try a different keyword." />
            ) : null}
          </div>
        </div>
      </div>

      <CreateFolderModal
        isOpen={isCreateModalOpen}
        value={newFolderName}
        onChange={setNewFolderName}
        onClose={() => { setIsCreateModalOpen(false); setNewFolderName(""); }}
        onSubmit={handleCreateFolder}
      />
    </div>
  );
}
