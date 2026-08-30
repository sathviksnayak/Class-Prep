"use client";

import { type ChangeEvent, useMemo, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { Breadcrumbs } from "@/components/library/Breadcrumbs";
import { CreateFolderModal } from "@/components/library/CreateFolderModal";
import { DocumentList } from "@/components/library/DocumentList";
import { EmptyState } from "@/components/library/EmptyState";
import { FolderGrid } from "@/components/library/FolderGrid";
import { LibraryHeader } from "@/components/library/LibraryHeader";
import { SearchBar } from "@/components/library/SearchBar";

type FolderNode = {
  id: string;
  name: string;
  children: FolderNode[];
  documents: DocumentNode[];
};

type DocumentNode = {
  id: string;
  name: string;
  type: string;
  size: string;
  uploadedAt: string;
};

type FolderPath = { id: string; name: string };

const initialLibrary: FolderNode = {
  id: "root",
  name: "My Library",
  children: [
    {
      id: "class-6",
      name: "Class 6",
      children: [
        {
          id: "class-6-math",
          name: "Mathematics",
          children: [],
          documents: [
            { id: "f1", name: "Fractions.pdf", type: "pdf", size: "4.2 MB", uploadedAt: "Aug 30, 2026" },
            { id: "f2", name: "Algebra Basics.pdf", type: "pdf", size: "3.8 MB", uploadedAt: "Aug 28, 2026" },
          ],
        },
        {
          id: "class-6-science",
          name: "Science",
          children: [],
          documents: [{ id: "f3", name: "Components of Food.pdf", type: "pdf", size: "2.9 MB", uploadedAt: "Aug 24, 2026" }],
        },
      ],
      documents: [],
    },
    {
      id: "class-7",
      name: "Class 7",
      children: [
        {
          id: "class-7-science",
          name: "Science",
          children: [],
          documents: [
            { id: "f4", name: "Nutrition in Plants.pdf", type: "pdf", size: "5.1 MB", uploadedAt: "Aug 30, 2026" },
            { id: "f5", name: "Heat.pdf", type: "pdf", size: "4.4 MB", uploadedAt: "Aug 16, 2026" },
          ],
        },
        {
          id: "class-7-math",
          name: "Mathematics",
          children: [],
          documents: [{ id: "f6", name: "Integers.pdf", type: "pdf", size: "2.7 MB", uploadedAt: "Aug 12, 2026" }],
        },
      ],
      documents: [],
    },
    {
      id: "question-papers",
      name: "Question Papers",
      children: [],
      documents: [
        { id: "q1", name: "Class 7 Unit Test 1.pdf", type: "pdf", size: "1.8 MB", uploadedAt: "Aug 22, 2026" },
        { id: "q2", name: "Class 6 Midterm.docx", type: "docx", size: "1.4 MB", uploadedAt: "Aug 18, 2026" },
      ],
    },
  ],
  documents: [],
};

function findFolderById(node: FolderNode, folderId: string): FolderNode | null {
  if (node.id === folderId) return node;

  for (const child of node.children) {
    const result = findFolderById(child, folderId);
    if (result) return result;
  }

  return null;
}

function updateFolderName(node: FolderNode, folderId: string, newName: string): FolderNode {
  if (node.id === folderId) {
    return { ...node, name: newName };
  }

  return {
    ...node,
    children: node.children.map((child) => updateFolderName(child, folderId, newName)),
  };
}

function removeFolder(node: FolderNode, folderId: string): FolderNode {
  return {
    ...node,
    children: node.children.filter((child) => child.id !== folderId).map((child) => removeFolder(child, folderId)),
  };
}

function updateDocumentName(node: FolderNode, documentId: string, newName: string): FolderNode {
  if (node.documents.some((document) => document.id === documentId)) {
    return {
      ...node,
      documents: node.documents.map((document) =>
        document.id === documentId ? { ...document, name: newName } : document,
      ),
    };
  }

  return {
    ...node,
    children: node.children.map((child) => updateDocumentName(child, documentId, newName)),
  };
}

function removeDocument(node: FolderNode, documentId: string): FolderNode {
  if (node.documents.some((document) => document.id === documentId)) {
    return {
      ...node,
      documents: node.documents.filter((document) => document.id !== documentId),
    };
  }

  return {
    ...node,
    children: node.children.map((child) => removeDocument(child, documentId)),
  };
}

function countFolderItems(folder: FolderNode): number {
  return folder.documents.length + folder.children.reduce((total, child) => total + countFolderItems(child), 0);
}

export default function LibraryPage() {
  const [library, setLibrary] = useState(initialLibrary);
  const [currentFolderId, setCurrentFolderId] = useState("root");
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const currentFolder = findFolderById(library, currentFolderId) ?? library;
  const currentPath: FolderPath[] = useMemo(() => {
    if (currentFolderId === "root") {
      return [{ id: "root", name: "My Library" }];
    }

    const stack: FolderPath[] = [];
    const walk = (node: FolderNode, targetId: string): boolean => {
      if (node.id === targetId) {
        stack.push({ id: node.id, name: node.name });
        return true;
      }

      for (const child of node.children) {
        if (walk(child, targetId)) {
          stack.push({ id: node.id, name: node.name });
          return true;
        }
      }

      return false;
    };

    walk(library, currentFolderId);
    const entries = stack.reverse();
    return [{ id: "root", name: "My Library" }, ...entries.filter((item) => item.id !== "root")];
  }, [currentFolderId, library]);

  const filteredFolders = useMemo(() => {
    if (!searchTerm.trim()) return currentFolder.children;

    return currentFolder.children.filter((folder) =>
      folder.name.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [currentFolder.children, searchTerm]);

  const filteredDocuments = useMemo(() => {
    if (!searchTerm.trim()) return currentFolder.documents;

    return currentFolder.documents.filter((document) =>
      document.name.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [currentFolder.documents, searchTerm]);

  const openFolder = (folderId: string) => {
    setCurrentFolderId(folderId);
  };

  const goToBreadcrumb = (folderId?: string) => {
    if (folderId) {
      setCurrentFolderId(folderId);
    } else {
      setCurrentFolderId("root");
    }
  };

  const handleCreateFolder = () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) return;

    const newFolder: FolderNode = {
      id: `folder-${Date.now()}`,
      name: trimmed,
      children: [],
      documents: [],
    };

    setLibrary((previous) => insertFolderIntoTree(previous, currentFolderId, newFolder));

    setNewFolderName("");
    setIsCreateModalOpen(false);
  };

  const handleUploadDocuments = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const uploaded = Array.from(files).map((file) => ({
      id: `doc-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: file.name,
      type: file.name.split(".").pop()?.toLowerCase() || "other",
      size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
      uploadedAt: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    }));

    setLibrary((previous) => {
      const target = findFolderById(previous, currentFolderId) ?? previous;

      const updated = {
        ...target,
        documents: [...target.documents, ...uploaded],
      };

      return updateFolderInTree(previous, currentFolderId, updated);
    });

    event.target.value = "";
  };

  const handleRenameFolder = (folderId: string) => {
    const folder = findFolderById(library, folderId);
    if (!folder) return;

    const nextName = window.prompt("Rename folder", folder.name);
    if (nextName && nextName.trim()) {
      setLibrary((previous) => updateFolderName(previous, folderId, nextName.trim()));
    }
  };

  const handleDeleteFolder = (folderId: string) => {
    const target = findFolderById(library, folderId);
    if (!target) return;

    const confirmed = window.confirm(`Delete “${target.name}” and all its contents?`);
    if (confirmed) {
      setLibrary((previous) => removeFolder(previous, folderId));
    }
  };

  const handleRenameDocument = (documentId: string) => {
    const document = currentFolder.documents.find((item) => item.id === documentId);
    if (!document) return;

    const nextName = window.prompt("Rename document", document.name);
    if (nextName && nextName.trim()) {
      setLibrary((previous) => updateDocumentName(previous, documentId, nextName.trim()));
    }
  };

  const handleDeleteDocument = (documentId: string) => {
    const document = currentFolder.documents.find((item) => item.id === documentId);
    if (!document) return;

    const confirmed = window.confirm(`Delete “${document.name}”?`);
    if (confirmed) {
      setLibrary((previous) => removeDocument(previous, documentId));
    }
  };

  const hasItems = currentFolder.children.length > 0 || currentFolder.documents.length > 0;
  const emptyStateTitle = filteredFolders.length === 0 && filteredDocuments.length === 0 ? "This folder is empty" : "No matching items";
  const emptyStateDescription = searchTerm
    ? "Try a different keyword or add a new folder or file."
    : "Upload teaching materials or create a new folder to organize your work.";

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
                <Button variant="secondary" onClick={() => setIsCreateModalOpen(true)} className="whitespace-nowrap">
                  + New Folder
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx"
                  multiple
                  onChange={handleUploadDocuments}
                  className="hidden"
                />
                <Button onClick={() => fileInputRef.current?.click()} className="whitespace-nowrap">
                  Upload
                </Button>
              </>
            }
          />

          <div className="mt-6">
            <Breadcrumbs items={currentPath.map((item) => ({ label: item.name, href: item.id === "root" ? undefined : item.id }))} onNavigate={goToBreadcrumb} />
          </div>

          <div className="mt-8 rounded-3xl border border-[#e4eae5] bg-white p-6 shadow-sm shadow-[#edf3ee] md:p-8">
            {!hasItems && !searchTerm ? (
              <EmptyState title="This library is empty" description="Create a folder or upload a teaching document to begin organizing your course resources." />
            ) : null}

            {(filteredFolders.length > 0 || filteredDocuments.length > 0) && (
              <>
                {filteredFolders.length > 0 ? (
                  <section>
                    <h2 className="mb-4 text-lg font-semibold text-[#1f2d27]">Folders</h2>
                    <FolderGrid
                      folders={filteredFolders.map((folder) => ({
                        id: folder.id,
                        name: folder.name,
                        itemCount: countFolderItems(folder),
                      }))}
                      onOpenFolder={openFolder}
                      onRenameFolder={handleRenameFolder}
                      onDeleteFolder={handleDeleteFolder}
                    />
                  </section>
                ) : null}

                {filteredDocuments.length > 0 ? (
                  <section className={filteredFolders.length > 0 ? "mt-8" : "mt-0"}>
                    <h2 className="mb-4 text-lg font-semibold text-[#1f2d27]">Documents</h2>
                    <DocumentList
                      documents={filteredDocuments}
                      onOpenDocument={(documentId) => {
                        const item = currentFolder.documents.find((document) => document.id === documentId);
                        if (item) window.alert(`Opening ${item.name} in the frontend preview.`);
                      }}
                      onRenameDocument={handleRenameDocument}
                      onDeleteDocument={handleDeleteDocument}
                    />
                  </section>
                ) : null}

                {filteredFolders.length === 0 && filteredDocuments.length === 0 ? (
                  <div className="mt-6"><EmptyState title={emptyStateTitle} description={emptyStateDescription} /></div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>

      <CreateFolderModal
        isOpen={isCreateModalOpen}
        value={newFolderName}
        onChange={setNewFolderName}
        onClose={() => {
          setIsCreateModalOpen(false);
          setNewFolderName("");
        }}
        onSubmit={handleCreateFolder}
      />
    </div>
  );
}

function updateFolderInTree(root: FolderNode, targetId: string, updatedFolder: FolderNode): FolderNode {
  if (root.id === targetId) return updatedFolder;

  return {
    ...root,
    children: root.children.map((child) =>
      child.id === targetId ? updatedFolder : updateFolderInTree(child, targetId, updatedFolder),
    ),
  };
}

function insertFolderIntoTree(root: FolderNode, targetId: string, newFolder: FolderNode): FolderNode {
  if (root.id === targetId) {
    return {
      ...root,
      children: [...root.children, newFolder],
    };
  }

  return {
    ...root,
    children: root.children.map((child) => insertFolderIntoTree(child, targetId, newFolder)),
  };
}
