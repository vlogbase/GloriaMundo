import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, Copy, ThumbsUp, ThumbsDown, Share2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Message } from "@/lib/types";
import { useMedia } from "react-use";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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

  // Helper to format the model ID to a short name
  const getShortModelName = (modelId?: string) => {
    if (!modelId) return null;
    
    // Extract the model name from the fully qualified ID
    if (modelId.includes("/")) {
      const parts = modelId.split("/");
      const modelName = parts[parts.length - 1];
      
      // Further shorten common model names
      return modelName
        .replace("gemini-pro", "Gemini")
        .replace("gemini-1.5-pro", "Gemini 1.5")
        .replace("llama-3", "Llama 3")
        .replace("mixtral", "Mixtral")
        .replace("gpt-4", "GPT-4")
        .replace("gpt-3.5", "GPT-3.5")
        .replace("-preview", "")
        .replace("-latest", "")
        .replace("-8k", "")
        .replace("-32k", "")
        .replace("-128k", "");
    }
    
    // For non-OpenRouter models, use as is
    return modelId;
  };

  return (
    <div className="flex flex-col items-end">
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
      
      {/* Model and token information for assistant messages - Improved formatting */}
      {message.role === "assistant" && message.modelId && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="text-xs text-muted-foreground mt-2 px-2 py-1 bg-muted/40 rounded-md">
                <div className="flex items-center space-x-2">
                  <span className="font-semibold">{getShortModelName(message.modelId)}</span>
                  {(message.promptTokens || message.completionTokens) && (
                    <span className="opacity-80 flex gap-2">
                      {message.promptTokens && (
                        <span className="border-r pr-2">
                          {message.promptTokens} in
                        </span>
                      )}
                      {message.completionTokens && (
                        <span>
                          {message.completionTokens} out
                        </span>
                      )}
                    </span>
                  )}
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p className="font-medium">Model: {message.modelId}</p>
              {message.promptTokens && <p>Input tokens: {message.promptTokens}</p>}
              {message.completionTokens && <p>Output tokens: {message.completionTokens}</p>}
              {message.promptTokens && message.completionTokens && 
                <p className="font-medium">Total tokens: {message.promptTokens + message.completionTokens}</p>}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
};
