import { DocumentIcon } from "./DocumentIcon";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export interface DocumentItemProps {
  id: number;
  fileName: string;
  fileType: string;
  fileSize: number;
  onPreview?: () => void;
  onRemove?: () => void;
  showRemove?: boolean;
  className?: string;
}

export const DocumentItem = ({
  id,
  fileName,
  fileType,
  fileSize,
  onPreview,
  onRemove,
  showRemove = false,
  className = "",
}: DocumentItemProps) => {
  // Format file size in a human-readable way
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) {
      return `${bytes} B`;
    } else if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    } else {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
  };

  return (
    <div 
      className={`flex items-center gap-1.5 bg-muted/50 rounded-md px-2 py-1 text-xs text-foreground max-w-full ${className}`}
      onClick={onPreview}
      role="button"
      aria-label={`Preview ${fileName}`}
    >
      <DocumentIcon fileType={fileType} size={14} className="flex-shrink-0" />
      <span className="truncate">{fileName}</span>
      <span className="text-muted-foreground text-[10px] ml-1 hidden sm:inline">
        {formatFileSize(fileSize)}
      </span>
      
      {showRemove && onRemove && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-4 w-4 p-0 ml-1 rounded-full hover:bg-destructive/10 hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label="Remove document"
        >
          <X size={10} />
        </Button>
      )}
    </div>
  );
};