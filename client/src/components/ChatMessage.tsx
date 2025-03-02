import { Message } from "@/lib/types";
import { MarkdownRenderer } from "@/lib/markdown";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MessageActions } from "@/components/MessageActions";
import { formatTime } from "@/lib/utils";
import { Globe, User } from "lucide-react";
import { Card } from "@/components/ui/card";
import { motion } from "framer-motion";
import { AdSense } from "@/components/AdSense";

interface ChatMessageProps {
  message: Message;
}

export const ChatMessage = ({ message }: ChatMessageProps) => {
  const isUser = message.role === "user";
  
  return (
    <>
      <motion.div 
        className="w-full max-w-4xl mx-auto flex gap-4 px-1 sm:px-0"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Avatar 
          className={isUser 
            ? "h-8 w-8 bg-userBg/40" 
            : "h-8 w-8 bg-gradient-to-r from-primary to-secondary text-white"
          }
        >
          <AvatarFallback className="text-sm">
            {isUser ? <User size={14} className="text-primary" /> : <Globe size={14} />}
          </AvatarFallback>
        </Avatar>
        
        <div className="flex-1">
          <Card 
            className={isUser
              ? "bg-userBg/30 p-4 rounded-lg rounded-tl-none shadow-none"
              : "bg-white p-4 rounded-lg rounded-tl-none shadow-sm"
            }
          >
            {isUser ? (
              <p>{message.content}</p>
            ) : (
              <div className="markdown">
                <MarkdownRenderer>{message.content}</MarkdownRenderer>
                
                {/* Display citations if available */}
                {message.citations && message.citations.length > 0 && (
                  <div className="mt-4 border-t pt-3 text-sm">
                    <h4 className="font-medium mb-2 text-primary">Sources:</h4>
                    <div className="space-y-1">
                      {message.citations.map((citation, index) => (
                        <div key={index} className="flex gap-2">
                          <span className="text-muted-foreground">[{index + 1}]</span>
                          <a 
                            href={citation} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 dark:text-blue-400 hover:underline truncate"
                          >
                            {citation}
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>
          
          <div className="flex items-center mt-1 ml-1">
            <div className="text-xs text-muted-foreground">
              {formatTime(message.createdAt)}
            </div>
            
            {!isUser && <MessageActions message={message} />}
          </div>
        </div>
      </motion.div>
      
      {/* Add AdSense below each AI response */}
      {!isUser && (
        <div className="w-full max-w-4xl mx-auto mt-3 mb-6 px-1 sm:px-0">
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
