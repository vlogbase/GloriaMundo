import { Message } from "@/lib/types";
import { MarkdownRenderer } from "@/lib/markdown";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MessageActions } from "@/components/MessageActions";
import { formatTime } from "@/lib/utils";
import { Globe, User } from "lucide-react";
import { Card } from "@/components/ui/card";
import { motion } from "framer-motion";

interface ChatMessageProps {
  message: Message;
}

export const ChatMessage = ({ message }: ChatMessageProps) => {
  const isUser = message.role === "user";
  
  return (
    <motion.div 
      className="max-w-4xl mx-auto flex gap-4"
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
  );
};
