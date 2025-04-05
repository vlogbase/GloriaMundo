import { useCallback, useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

export interface Document {
  id: number;
  fileName: string;
  fileType: string;
  fileSize: number;
  createdAt: string;
}

export const useDocuments = (conversationId: number | undefined) => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Fetch documents for the current conversation
  const fetchDocuments = useCallback(async () => {
    if (!conversationId) return;
    
    setIsLoading(true);
    try {
      const response = await fetch(`/api/conversations/${conversationId}/documents`);
      
      if (!response.ok) {
        if (response.status === 404) {
          setDocuments([]);
          return;
        }
        throw new Error("Failed to fetch documents");
      }
      
      const data = await response.json();
      setDocuments(data);
    } catch (error) {
      console.error("Error fetching documents:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load documents",
      });
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, toast]);

  // Delete a document
  const deleteDocument = useCallback(async (documentId: number) => {
    try {
      const response = await fetch(`/api/documents/${documentId}`, {
        method: "DELETE",
      });
      
      if (!response.ok) {
        throw new Error("Failed to delete document");
      }
      
      // Update local state
      setDocuments(prev => prev.filter(doc => doc.id !== documentId));
      
      toast({
        title: "Document deleted",
        description: "Document has been removed successfully",
      });
    } catch (error) {
      console.error("Error deleting document:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete document",
      });
    }
  }, [toast]);

  // Load documents when conversation ID changes
  useEffect(() => {
    if (conversationId) {
      fetchDocuments();
    } else {
      setDocuments([]);
    }
  }, [conversationId, fetchDocuments]);

  // Function to update documents list after a new upload
  const addDocument = useCallback((document: Document) => {
    setDocuments(prev => [document, ...prev]);
  }, []);

  return {
    documents,
    isLoading,
    fetchDocuments,
    deleteDocument,
    addDocument,
  };
};