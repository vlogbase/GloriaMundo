import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DocumentIcon } from "./DocumentIcon";
import { OptimizedDocumentPreview } from "./OptimizedDocumentPreview";

interface DocumentPreviewModalProps {
  isOpen: boolean;
  documentId: number | null;
  fileName: string;
  fileType: string;
  onClose: () => void;
}

export const DocumentPreviewModal = ({
  isOpen,
  documentId,
  fileName,
  fileType,
  onClose,
}: DocumentPreviewModalProps) => {
  // Track when the dialog is fully mounted to prevent eagerly loading content
  const [isFullyMounted, setIsFullyMounted] = useState(false);
  
  // Handle dialog open state changes
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose();
      // Reset mounted state when dialog closes
      setIsFullyMounted(false);
    } else {
      // Set fully mounted when dialog opens
      setIsFullyMounted(true);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent 
        className="sm:max-w-md"
        // Use onOpenAutoFocus instead of onAnimationComplete
        onOpenAutoFocus={() => setIsFullyMounted(true)}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DocumentIcon fileType={fileType} size={18} />
            <span className="truncate">{fileName}</span>
          </DialogTitle>
          <DialogDescription>
            Document preview
          </DialogDescription>
        </DialogHeader>
        
        {/* Only render optimized document preview when fully mounted and has ID */}
        <div className="h-[300px] overflow-auto rounded-md bg-muted/30">
          {isFullyMounted && documentId ? (
            <OptimizedDocumentPreview
              documentId={documentId}
              fileName={fileName}
              fileType={fileType}
              isPreviewOpen={isOpen && isFullyMounted}
            />
          ) : (
            <div className="flex justify-center items-center h-full">
              <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}
        </div>
        
        <div className="flex justify-end gap-2 mt-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => {
              if (documentId) {
                // Create a download link and trigger the download
                const downloadUrl = `/api/documents/${documentId}/download`;
                window.open(downloadUrl, '_blank');
              }
            }}
            disabled={!documentId}
          >
            Download
          </Button>
          <Button variant="default" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};