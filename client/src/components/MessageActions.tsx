import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, Copy, ThumbsUp, ThumbsDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Message } from "@/lib/types";

interface MessageActionsProps {
  message: Message;
}

export const MessageActions = ({ message }: MessageActionsProps) => {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      
      toast({
        description: "Message copied to clipboard",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        description: "Failed to copy message",
      });
    }
  };

  const handleLike = () => {
    setLiked(!liked);
    if (liked) return;
    
    if (disliked) {
      setDisliked(false);
    }
    
    toast({
      description: "Thank you for your feedback!",
    });
  };

  const handleDislike = () => {
    setDisliked(!disliked);
    if (disliked) return;
    
    if (liked) {
      setLiked(false);
    }
    
    toast({
      description: "Thank you for your feedback!",
    });
  };

  return (
    <div className="ml-2 flex space-x-2">
      <Button 
        variant="ghost" 
        size="icon"
        className="h-5 w-5 text-muted-foreground hover:text-primary" 
        onClick={handleCopy}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </Button>
      
      <Button 
        variant="ghost" 
        size="icon"
        className={`h-5 w-5 ${liked ? 'text-primary' : 'text-muted-foreground hover:text-primary'}`}
        onClick={handleLike}
      >
        <ThumbsUp size={14} />
      </Button>
      
      <Button 
        variant="ghost" 
        size="icon"
        className={`h-5 w-5 ${disliked ? 'text-destructive' : 'text-muted-foreground hover:text-destructive'}`} 
        onClick={handleDislike}
      >
        <ThumbsDown size={14} />
      </Button>
    </div>
  );
};
