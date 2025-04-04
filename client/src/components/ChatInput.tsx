import { useState, FormEvent, useRef, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Send, Lightbulb, Search, Image, X, Upload, Camera, Network } from "lucide-react";
import { useModelSelection } from "@/hooks/useModelSelection";
import { useOpenRouterModels } from "@/hooks/useOpenRouterModels";
import { ModelType } from "@/lib/types";
import { MODEL_OPTIONS } from "@/lib/models";
import { ModelPresets } from "@/components/ModelPresets";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ChatInputProps {
  onSendMessage: (message: string, image?: string) => void;
  isLoading: boolean;
}

export const ChatInput = ({ onSendMessage, isLoading }: ChatInputProps) => {
  const [message, setMessage] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { selectedModel, setSelectedModel } = useModelSelection();
  const { models, selectedModelId, setSelectedModelId, isLoading: modelsLoading } = useOpenRouterModels();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    
    if ((!message.trim() && !selectedImage) || isLoading) return;
    
    // If OpenRouter model is selected, pass the selected model ID in the message metadata
    if (selectedModel === 'openrouter' && selectedModelId) {
      // We'll extend this method later to handle OpenRouter models
      const modelMetadata = { modelId: selectedModelId, modelType: 'openrouter' };
      // Append the model metadata to the message - this will be handled in the API call
      const messageWithMetadata = JSON.stringify({ 
        content: message, 
        ...modelMetadata 
      });
      onSendMessage(messageWithMetadata, selectedImage || undefined);
    } else {
      onSendMessage(message, selectedImage || undefined);
    }
    
    setMessage("");
    setSelectedImage(null);
    setImagePreviewUrl(null);
    
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };
  
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      
      reader.onload = (event) => {
        const img = document.createElement('img');
        img.onload = () => {
          processImage(img);
        };
        
        img.src = event.target?.result as string;
      };
      
      reader.readAsDataURL(file);
    }
  };
  
  // Process and resize image if needed
  const processImage = (img: HTMLImageElement) => {
    // Check if image needs resizing (max 1024px on any side)
    const maxSize = 1024;
    const needsResize = img.width > maxSize || img.height > maxSize;
    
    if (needsResize) {
      // Resize image while preserving aspect ratio
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      
      if (width > height) {
        if (width > maxSize) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        }
      } else {
        if (height > maxSize) {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
      }
      
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        // Use image/png for better quality when needed for multimodal analysis
        const resizedImageData = canvas.toDataURL('image/jpeg', 0.9);
        // Ensure the model is switched to multimodal when an image is added
        if (selectedModel !== 'multimodal') {
          setSelectedModel('multimodal');
        }
        setSelectedImage(resizedImageData);
        setImagePreviewUrl(resizedImageData);
      }
    } else {
      // Use original image if it doesn't need resizing
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const imageData = canvas.toDataURL('image/jpeg', 0.9);
        // Ensure the model is switched to multimodal when an image is added
        if (selectedModel !== 'multimodal') {
          setSelectedModel('multimodal');
        }
        setSelectedImage(imageData);
        setImagePreviewUrl(imageData);
      }
    }
  };
  
  const removeImage = () => {
    setSelectedImage(null);
    setImagePreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  // Start camera for taking a photo
  const startCamera = async () => {
    setCameraModalOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' }
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      setCameraModalOpen(false);
    }
  };
  
  // Close camera and stop stream
  const closeCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      const tracks = stream.getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setCameraModalOpen(false);
  };
  
  // Take a photo from camera stream
  const takePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      // Set canvas dimensions to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // Draw video frame to canvas
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Create an image from the canvas
        const img = document.createElement('img');
        img.onload = () => {
          processImage(img);
          closeCamera();
        };
        img.src = canvas.toDataURL('image/jpeg', 0.9);
      }
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    const adjustHeight = () => {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    };
    
    textarea.addEventListener("input", adjustHeight);
    return () => textarea.removeEventListener("input", adjustHeight);
  }, []);
  
  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Submit on Enter (without Shift)
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };
  
  // Get model icon based on id
  const getModelIcon = (id: ModelType | string) => {
    switch(id) {
      case "reasoning":
        return <Lightbulb size={18} />;
      case "search":
        return <Search size={18} />;
      case "multimodal":
        return <Image size={18} />;
      case "openrouter":
        return <Network size={18} />;
      default:
        return <Lightbulb size={18} />;
    }
  };

  return (
    <div className="border-t border-border p-4">
      <div className="max-w-4xl mx-auto">
        {/* Camera Dialog */}
        <Dialog open={cameraModalOpen} onOpenChange={open => !open && closeCamera()}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Take a Photo</DialogTitle>
              <DialogDescription>
                Center your subject in the frame and click the capture button.
              </DialogDescription>
            </DialogHeader>
            <div className="relative overflow-hidden rounded-md bg-background">
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                className="w-full h-auto aspect-video object-cover"
              />
              <canvas ref={canvasRef} className="hidden" />
            </div>
            <div className="flex justify-center gap-4 mt-4">
              <Button onClick={closeCamera} variant="outline">Cancel</Button>
              <Button onClick={takePhoto} className="bg-primary text-primary-foreground hover:bg-primary/90">
                Capture
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        
        {/* Model presets - the new single control for model selection */}
        <ModelPresets />
        
        {imagePreviewUrl && (
          <div className="mb-3 relative rounded-lg overflow-hidden border border-border">
            <img 
              src={imagePreviewUrl} 
              alt="Uploaded preview" 
              className="max-h-64 max-w-full object-contain mx-auto"
            />
            <Button
              type="button"
              size="icon"
              variant="destructive"
              className="absolute top-2 right-2 h-8 w-8 rounded-full"
              onClick={removeImage}
            >
              <X size={16} />
            </Button>
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="relative">
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message GloriaMundo..."
            className={`w-full p-3 ${selectedModel === 'multimodal' && !selectedImage ? 'pr-20' : 'pr-12'} min-h-[44px] max-h-[200px] resize-none border-border rounded-lg focus:ring-2 focus:ring-primary/50`}
            disabled={isLoading}
          />
          
          {selectedModel === 'multimodal' && !selectedImage && (
            <>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageUpload}
                accept="image/*"
                className="hidden"
                id="image-upload"
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="absolute right-20 bottom-3 text-muted-foreground hover:text-primary transition-colors"
                disabled={isLoading}
                onClick={() => fileInputRef.current?.click()}
                title="Upload image"
              >
                <Upload size={18} />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="absolute right-12 bottom-3 text-muted-foreground hover:text-primary transition-colors"
                disabled={isLoading}
                onClick={startCamera}
                title="Take photo"
              >
                <Camera size={18} />
              </Button>
            </>
          )}
          
          <Button
            type="submit"
            size="icon"
            variant="ghost"
            className="absolute right-3 bottom-3 text-primary hover:text-primary/80 transition-colors"
            disabled={(isLoading || (!message.trim() && !selectedImage))}
          >
            <Send size={18} />
          </Button>
        </form>
        
        <p className="text-xs text-muted-foreground mt-2 text-center">
          For important decisions, always confirm information with trusted sources.
        </p>
      </div>
    </div>
  );
};
