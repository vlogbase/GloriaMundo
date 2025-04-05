import { useEffect, useState } from "react";
import { Message } from "@/lib/types";
import { MarkdownRenderer } from "@/lib/markdown";
import { MessageActions } from "@/components/MessageActions";
import { formatTime, refreshSkimlinks } from "@/lib/utils";
import { motion } from "framer-motion";
import { AdSense } from "@/components/AdSense";
import { Document } from "@/hooks/useDocuments";
import { DocumentItem } from "./DocumentItem";
import { DocumentPreviewModal } from "./DocumentPreviewModal";

interface ChatMessageProps {
  message: Message;
  relatedDocuments?: Document[];
}

export const ChatMessage = ({ message, relatedDocuments = [] }: ChatMessageProps) => {
  const isUser = message.role === "user";
  const [previewDocument, setPreviewDocument] = useState<Document | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  
  // Use effect to refresh Skimlinks when an AI message is rendered
  useEffect(() => {
    // Only trigger Skimlinks refresh for AI (assistant) messages
    if (!isUser) {
      // Small delay to ensure content is fully rendered
      const timer = setTimeout(() => {
        refreshSkimlinks();
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [isUser, message.id]);
  
  // Handler for document preview
  const handlePreviewDocument = (document: Document) => {
    setPreviewDocument(document);
    setIsPreviewOpen(true);
  };
  
  return (
    <>
      <motion.div 
        className="w-full max-w-4xl mx-auto px-4 sm:px-6"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {isUser ? (
          <div className="flex justify-end">
            <div className="max-w-[75%]">
              <div className="bg-userBg/30 p-4 rounded-2xl shadow-none">
                <p>{message.content}</p>
                
                {/* Show attached documents with the message if available */}
                {relatedDocuments.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border/30">
                    {relatedDocuments.map((doc) => (
                      <DocumentItem
                        key={doc.id}
                        id={doc.id}
                        fileName={doc.fileName}
                        fileType={doc.fileType}
                        fileSize={doc.fileSize}
                        onPreview={() => handlePreviewDocument(doc)}
                        showRemove={false}
                      />
                    ))}
                  </div>
                )}
              </div>
              <div className="text-xs text-muted-foreground text-right mt-1 mr-1">
                {formatTime(message.createdAt)}
              </div>
            </div>
          </div>
        ) : (
          <div className="w-full">
            <div className="markdown break-words">
              {/* Pass citations to MarkdownRenderer for processing reference links */}
              <MarkdownRenderer citations={message.citations}>{message.content}</MarkdownRenderer>
              
              {/* Display citations if available */}
              {message.citations && message.citations.length > 0 && (
                <div className="mt-4 border-t pt-3 text-sm">
                  <h4 className="font-medium mb-2 text-primary">Sources:</h4>
                  <div className="space-y-1">
                    {message.citations.map((citation, index) => (
                      <div key={index} className="flex gap-2 flex-wrap">
                        <span className="text-muted-foreground">[{index + 1}]</span>
                        <a 
                          href={citation} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-600 dark:text-blue-400 hover:underline break-all"
                        >
                          {citation}
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex items-center mt-1">
              <div className="text-xs text-muted-foreground">
                {formatTime(message.createdAt)}
              </div>
              
              <MessageActions message={message} />
            </div>
          </div>
        )}
      </motion.div>
      
      {/* Add AdSense below each AI response */}
      {!isUser && (
        <div className="w-full max-w-4xl mx-auto mt-3 mb-6 px-4 sm:px-6">
          <AdSense 
            adSlot="5678901234" 
            adFormat="auto" 
            style={{ display: 'block', maxHeight: '150px' }}
            className="rounded-md overflow-hidden"
          />
        </div>
      )}
      
      {/* Document preview modal */}
      {previewDocument && (
        <DocumentPreviewModal
          isOpen={isPreviewOpen}
          documentId={previewDocument.id}
          fileName={previewDocument.fileName}
          fileType={previewDocument.fileType}
          onClose={() => setIsPreviewOpen(false)}
        />
      )}
    </>
  );
};
