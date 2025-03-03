import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, Copy, ThumbsUp, ThumbsDown, Share2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Message } from "@/lib/types";
import { useMedia } from "react-use";

interface MessageActionsProps {
  message: Message;
}

export const MessageActions = ({ message }: MessageActionsProps) => {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);
  const isMobile = useMedia('(max-width: 768px)', false);

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
  
  const handleShare = async () => {
    try {
      const shareUrl = `${window.location.origin}/chat/${message.conversationId}`;
      
      // Handle native sharing on mobile if available
      if (navigator.share && isMobile) {
        await navigator.share({
          title: 'GloriaMundo Chat',
          text: 'Check out this conversation on GloriaMundo',
          url: shareUrl,
        });
        
        toast({
          description: "Shared successfully!",
        });
        return;
      }
      
      // Desktop/fallback: copy to clipboard
      await navigator.clipboard.writeText(shareUrl);
      setSharing(true);
      setTimeout(() => setSharing(false), 2000);
      
      toast({
        description: "Chat link copied to clipboard!",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        description: "Failed to share chat",
      });
    }
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
      
      {/* Only show share button for assistant messages */}
      {message.role === "assistant" && (
        <Button 
          variant="ghost" 
          size="icon"
          className="h-5 w-5 text-muted-foreground hover:text-primary" 
          onClick={handleShare}
          title="Share this conversation"
        >
          {sharing ? <Check size={14} /> : <Share2 size={14} />}
        </Button>
      )}
      
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
