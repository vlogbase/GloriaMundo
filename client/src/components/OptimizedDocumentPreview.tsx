import { useState, useEffect } from 'react';
import { OptimizedImage } from './OptimizedImage';
import { Loader2 } from 'lucide-react';

interface OptimizedDocumentPreviewProps {
  documentId: number;
  fileName: string;
  fileType: string;
  isPreviewOpen?: boolean;
}

/**
 * OptimizedDocumentPreview Component
 * 
 * Efficiently renders document previews with:
 * - Lazy loading based on visibility
 * - Format-specific optimizations
 * - Progressive loading indicators
 * - Error handling
 */
export const OptimizedDocumentPreview = ({
  documentId,
  fileName,
  fileType,
  isPreviewOpen = false
}: OptimizedDocumentPreviewProps) => {
  const [content, setContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Determine if this is an image file
  const isImage = /\.(jpe?g|png|gif|webp|svg)$/i.test(fileType);
  
  // Fetch document content when component becomes visible
  useEffect(() => {
    if (!isPreviewOpen) return;
    
    const fetchDocumentContent = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const response = await fetch(`/api/documents/${documentId}/content`);
        if (!response.ok) {
          throw new Error(`Failed to load document: ${response.statusText}`);
        }
        
        const data = await response.json();
        setContent(data.content);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load document');
        console.error('Error loading document:', err);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchDocumentContent();
  }, [documentId, isPreviewOpen]);
  
  // Use a better content preview based on file type
  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="mt-2 text-muted-foreground">Loading document preview...</p>
        </div>
      );
    }
    
    if (error) {
      return (
        <div className="p-6 text-center bg-destructive/10 rounded-md">
          <p className="text-destructive font-medium">Error loading document</p>
          <p className="text-sm text-muted-foreground mt-1">{error}</p>
        </div>
      );
    }
    
    if (!content) {
      return (
        <div className="p-6 text-center">
          <p className="text-muted-foreground">No preview available</p>
        </div>
      );
    }
    
    if (isImage) {
      // For images, use our optimized image component
      return (
        <div className="flex justify-center p-4">
          <OptimizedImage
            src={content}
            alt={fileName}
            className="max-w-full max-h-[70vh]"
            onError={() => setError('Failed to load image')}
          />
        </div>
      );
    }
    
    // For text-based documents, render as text with syntax highlighting
    if (fileType.endsWith('.txt') || fileType.endsWith('.md') || fileType.endsWith('.json')) {
      return (
        <div className="p-4 bg-muted/20 rounded-md overflow-auto max-h-[70vh]">
          <pre className="whitespace-pre-wrap text-sm">
            {content}
          </pre>
        </div>
      );
    }
    
    // For PDF and other document types, show download link
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center">
        <p className="mb-4">
          This document type ({fileType}) can't be previewed directly.
        </p>
        <a
          href={`/api/documents/${documentId}/download`}
          download={fileName}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          Download {fileName}
        </a>
      </div>
    );
  };
  
  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="bg-background shadow-lg rounded-lg overflow-hidden">
        <div className="border-b border-border px-4 py-3 flex justify-between items-center">
          <h3 className="font-medium truncate">{fileName}</h3>
          <span className="text-xs text-muted-foreground px-2 py-1 bg-muted/30 rounded-full">
            {fileType.replace('.', '')}
          </span>
        </div>
        
        <div className="p-4">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};