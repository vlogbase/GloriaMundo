import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DocumentIcon } from "./DocumentIcon";
import { Loader2 } from "lucide-react";

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
  const [loading, setLoading] = useState(true);
  const [documentContent, setDocumentContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch document content when the modal opens and document ID changes
  useEffect(() => {
    if (isOpen && documentId) {
      setLoading(true);
      setError(null);
      
      // Fetch document content from the server
      fetch(`/api/documents/${documentId}/content`)
        .then(response => {
          if (!response.ok) {
            throw new Error(`Failed to load document: ${response.status} ${response.statusText}`);
          }
          return response.text();
        })
        .then(content => {
          // Handle different file types appropriately
          if (fileType === "application/pdf") {
            setDocumentContent("PDF document preview is not available in this view. You can download the document to view it.");
          } else if (fileType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
            setDocumentContent("DOCX document preview is not available in this view. You can download the document to view it.");
          } else if (fileType.startsWith("text/")) {
            // For text files, display the actual content
            setDocumentContent(content);
          } else {
            setError("Preview not available for this file type.");
          }
        })
        .catch(err => {
          console.error("Error fetching document content:", err);
          setError(`Failed to load document: ${err.message}`);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isOpen, documentId, fileType]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DocumentIcon fileType={fileType} size={18} />
            <span className="truncate">{fileName}</span>
          </DialogTitle>
          <DialogDescription>
            Document preview
          </DialogDescription>
        </DialogHeader>
        
        <div className="p-4 bg-muted/30 rounded-md h-[300px] overflow-auto">
          {loading ? (
            <div className="flex justify-center items-center h-full">
              <Loader2 className="animate-spin h-6 w-6 text-primary" />
            </div>
          ) : error ? (
            <div className="text-destructive text-sm">{error}</div>
          ) : (
            <div className="whitespace-pre-wrap text-sm">{documentContent}</div>
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
            disabled={!documentId || loading}
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