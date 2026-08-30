import { DocumentCard } from "@/components/library/DocumentCard";

type DocumentItem = {
  id: string;
  name: string;
  type: string;
  size: string;
  uploadedAt: string;
};

type DocumentListProps = {
  documents: DocumentItem[];
  onOpenDocument: (documentId: string) => void;
  onRenameDocument: (documentId: string) => void;
  onDeleteDocument: (documentId: string) => void;
};

export function DocumentList({ documents, onOpenDocument, onRenameDocument, onDeleteDocument }: DocumentListProps) {
  return (
    <div className="space-y-3">
      {documents.map((document) => (
        <DocumentCard
          key={document.id}
          name={document.name}
          type={document.type}
          size={document.size}
          uploadedAt={document.uploadedAt}
          onOpen={() => onOpenDocument(document.id)}
          onRename={() => onRenameDocument(document.id)}
          onDelete={() => onDeleteDocument(document.id)}
        />
      ))}
    </div>
  );
}
