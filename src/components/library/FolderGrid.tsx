import { FolderCard } from "@/components/library/FolderCard";

type FolderItem = {
  id: string;
  name: string;
  itemCount: number;
};

type FolderGridProps = {
  folders: FolderItem[];
  onOpenFolder: (folderId: string) => void;
  onRenameFolder: (folderId: string) => void;
  onDeleteFolder: (folderId: string) => void;
};

export function FolderGrid({ folders, onOpenFolder, onRenameFolder, onDeleteFolder }: FolderGridProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {folders.map((folder) => (
        <FolderCard
          key={folder.id}
          name={folder.name}
          itemCount={folder.itemCount}
          onOpen={() => onOpenFolder(folder.id)}
          onRename={() => onRenameFolder(folder.id)}
          onDelete={() => onDeleteFolder(folder.id)}
        />
      ))}
    </div>
  );
}
