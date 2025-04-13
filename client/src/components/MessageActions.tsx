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

    // Handle legacy model types
    if (modelId === 'reasoning') {
      return 'o3 Mini';
    }
    
    if (modelId === 'search') {
      return 'Sonar Pro';
    }
    
    // Extract the model name from the fully qualified ID
    if (modelId.includes("/")) {
      const parts = modelId.split("/");
      const modelName = parts[parts.length - 1];
      
      // Further shorten common model names
      return modelName
        .replace("gemini-pro", "Gemini")
        .replace("gemini-1.5-pro", "Gemini 1.5")
        .replace("gemini-2.0-flash", "Gemini 2.0 Flash")
        .replace("gemini-2.5-pro", "Gemini 2.5 Pro")
        .replace("llama-3", "Llama 3")
        .replace("mixtral", "Mixtral")
        .replace("gpt-4", "GPT-4")
        .replace("gpt-4o", "GPT-4o")
        .replace("claude-3", "Claude 3")
        .replace("o3-mini", "o3 Mini")
        .replace("sonar-pro", "Sonar Pro")
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
      
      {/* Enhanced Model and token information display */}
      {message.role === "assistant" && message.modelId && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="text-xs text-muted-foreground mt-2 px-2 py-1 bg-muted/40 rounded-md inline-flex items-center">
                <div className="flex items-center space-x-2">
                  {/* Model name with icon */}
                  <span className="font-semibold flex items-center">
                    <svg viewBox="0 0 24 24" className="w-3 h-3 mr-1 fill-current" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 16.5a4.5 4.5 0 100-9 4.5 4.5 0 000 9zm0 1.5a6 6 0 100-12 6 6 0 000 12zm0-4.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
                    </svg>
                    {getShortModelName(message.modelId)}
                  </span>
                  
                  {/* Token usage with clear labeling */}
                  {(message.promptTokens || message.completionTokens) && (
                    <span className="opacity-75 flex items-center gap-2 border-l border-muted-foreground/30 pl-2 ml-1">
                      {/* Token icon */}
                      <svg 
                        viewBox="0 0 24 24" 
                        className="w-3 h-3 mr-0.5 fill-current" 
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path d="M12 22a10 10 0 110-20 10 10 0 010 20zm0-15v5l4 4" />
                      </svg>
                      
                      {/* Token counts with descriptive labels */}
                      <span className="flex items-center">
                        {message.promptTokens && (
                          <span className="flex items-center mr-2">
                            <span className="opacity-75 mr-1">In:</span> 
                            <span className="font-medium">{message.promptTokens}</span>
                          </span>
                        )}
                        
                        {message.completionTokens && (
                          <span className="flex items-center">
                            <span className="opacity-75 mr-1">Out:</span> 
                            <span className="font-medium">{message.completionTokens}</span>
                          </span>
                        )}
                      </span>
                    </span>
                  )}
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="p-3 max-w-xs">
              <p className="font-medium mb-1">Model information</p>
              <p className="text-xs mb-2 text-muted-foreground">
                {message.modelId === 'reasoning' ? 'openai/o3-mini-high (Reasoning)' :
                 message.modelId === 'search' ? 'perplexity/sonar-pro (Search)' :
                 message.modelId}
              </p>
              
              <div className="grid grid-cols-2 gap-1 text-sm">
                {message.promptTokens && (
                  <div>
                    <span className="text-muted-foreground">Input:</span>{" "}
                    <span className="font-medium">{message.promptTokens} tokens</span>
                  </div>
                )}
                
                {message.completionTokens && (
                  <div>
                    <span className="text-muted-foreground">Output:</span>{" "}
                    <span className="font-medium">{message.completionTokens} tokens</span>
                  </div>
                )}
                
                {message.promptTokens && message.completionTokens && (
                  <div className="col-span-2 mt-1 pt-1 border-t">
                    <span className="text-muted-foreground">Total:</span>{" "}
                    <span className="font-medium">{message.promptTokens + message.completionTokens} tokens</span>
                  </div>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
};
