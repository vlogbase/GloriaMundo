import { useEffect } from "react";
import { Message } from "@/lib/types";
import { MarkdownRenderer } from "@/lib/markdown";
import { MessageActions } from "@/components/MessageActions";
import { formatTime, refreshSkimlinks } from "@/lib/utils";
import { motion } from "framer-motion";
import { AdSense } from "@/components/AdSense";

interface ChatMessageProps {
  message: Message;
}

export const ChatMessage = ({ message }: ChatMessageProps) => {
  const isUser = message.role === "user";
  
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
              </div>
              <div className="text-xs text-muted-foreground text-right mt-1 mr-1">
                {formatTime(message.createdAt)}
              </div>
            </div>
          </div>
        ) : (
          <div className="w-full">
            <div className="markdown break-words">
              <MarkdownRenderer>{message.content}</MarkdownRenderer>
              
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
    </>
  );
};
