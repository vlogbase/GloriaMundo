import { useState, FormEvent, useRef, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Send, Lightbulb, Search, Image, X, Camera, Network, Paperclip, File, Lock } from "lucide-react";
import { useModelSelection } from "@/hooks/useModelSelection";
import { useOpenRouterModels } from "@/hooks/useOpenRouterModels";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ModelType } from "@/lib/types";
import { MODEL_OPTIONS } from "@/lib/models";
import { ModelPresets } from "@/components/ModelPresets";
import { CameraView } from "@/components/CameraView";
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

import { Document } from "@/hooks/useDocuments";
import { DocumentItem } from "./DocumentItem";

// Define constants for file types
const documentAcceptTypes = ".pdf,.docx,.txt,.html,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/html,text/markdown";
const multimodalAcceptTypes = ".jpg,.jpeg,.png,.gif,.webp,.bmp,.tiff,.svg,image/jpeg,image/png,image/gif,image/webp,image/bmp,image/tiff,image/svg+xml,.pdf,.docx,.txt,.rtf,.csv,video/*,audio/*," + documentAcceptTypes;

interface ChatInputProps {
  onSendMessage: (message: string, image?: string) => void;
  isLoading: boolean;
  onUploadDocument?: (file: File) => Promise<any>;
  documents?: Document[];
  onPreviewDocument?: (document: Document) => void;
}

export const ChatInput = ({ 
  onSendMessage, 
  isLoading, 
  onUploadDocument,
  documents = [],
  onPreviewDocument
}: ChatInputProps) => {
  const [message, setMessage] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  // Camera is now handled by the CameraView component
  const { selectedModel, setSelectedModel } = useModelSelection();
  const { models, selectedModelId, setSelectedModelId, isLoading: modelsLoading } = useOpenRouterModels();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  
  // Query for user's credit balance
  const { data: user } = useQuery({
    queryKey: ['/api/auth/me'],
    queryFn: async () => {
      try {
        const response = await fetch('/api/auth/me', {
          credentials: 'include',
        });
        
        if (!response.ok) {
          if (response.status === 401) {
            return null;
          }
          throw new Error(`Failed to fetch user data: ${response.statusText}`);
        }
        
        return await response.json();
      } catch (error) {
        console.error('Failed to fetch user data:', error);
        return null;
      }
    }
  });
  
  // Check if user has credits (positive balance)
  const hasCredits = user?.creditBalance > 0;
  
  // Handle redirection to account balance page for locked features
  const handleLockedFeatureClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigate('/account-balance');
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    
    if ((!message.trim() && !selectedImage) || isLoading) return;
    
    // Always send the raw message text as the first parameter
    // The model metadata will be handled separately in the useChat hook
    onSendMessage(message, selectedImage || undefined);
    
    setMessage("");
    setSelectedImage(null);
    setImagePreviewUrl(null);
    
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };
  
  const handleContentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      
      // Check file type to determine processing method
      if (file.type.startsWith('image/')) {
        // For images, process with image-specific handling
        const reader = new FileReader();
        
        reader.onload = (event) => {
          const img = document.createElement('img');
          img.onload = () => {
            processImage(img);
          };
          
          img.src = event.target?.result as string;
        };
        
        reader.readAsDataURL(file);
      } else {
        // For other file types (audio, video, documents, etc.), just show a preview
        toast({
          title: "File selected",
          description: `${file.name} (${(file.size / 1024).toFixed(1)} KB) will be sent with your message.`,
          duration: 3000
        });
        
        // Create a data URL for the file
        const reader = new FileReader();
        reader.onload = (event) => {
          // Ensure the model is switched to multimodal when any file is added
          if (selectedModel !== 'multimodal') {
            setSelectedModel('multimodal');
          }
          setSelectedImage(event.target?.result as string);
          // Use a generic preview for non-image files
          setImagePreviewUrl('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLWZpbGUiPjxwYXRoIGQ9Ik0xNC41IDJINmEyIDIgMCAwIDAtMiAydjE2YTIgMiAwIDAgMCAyIDJoMTJhMiAyIDAgMCAwIDItMlY3LjVMI'+
          'DE0LjUgMnoiLz48cG9seWxpbmUgcG9pbnRzPSIxNCAyIDE0IDggMjAgOCIvPjwvc3ZnPg==');
        };
        
        reader.readAsDataURL(file);
      }
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
    if (documentInputRef.current) {
      documentInputRef.current.value = '';
    }
  };
  
  // Start camera for taking a photo - simplified now that CameraView handles all camera operations
  const startCamera = () => {
    setCameraModalOpen(true);
  };
  
  // Close camera modal - CameraView component handles the stream cleanup
  const closeCamera = () => {
    setCameraModalOpen(false);
  };
  
  // No longer needed - CameraView component handles photo capture
  
  // Handle document upload
  const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !onUploadDocument) return;
    
    const file = e.target.files[0];
    
    // Different validation based on model type
    if (selectedModel !== 'multimodal') {
      // For standard models, only allow document types
      const allowedTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'text/html',
        'text/markdown'
      ];
      
      if (!allowedTypes.includes(file.type)) {
        toast({
          variant: "destructive",
          title: "Invalid file type",
          description: "Please upload a PDF, DOCX, TXT, HTML, or MD file."
        });
        
        // Reset the file input
        if (documentInputRef.current) {
          documentInputRef.current.value = '';
        }
        return;
      }
    } else {
      // For multimodal models - check if file is image, video, audio or document
      // If it's an image, process it with handleContentUpload
      if (file.type.startsWith('image/')) {
        return handleContentUpload(e);
      }
      
      // If it's an audio or video file, process it as content
      if (file.type.startsWith('audio/') || file.type.startsWith('video/')) {
        return handleContentUpload(e);
      }
    }
    
    // Maximum file size (50MB)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({
        variant: "destructive",
        title: "File too large",
        description: "Maximum file size is 50MB."
      });
      
      // Reset the file input
      if (documentInputRef.current) {
        documentInputRef.current.value = '';
      }
      return;
    }
    
    try {
      setUploadingDocument(true);
      
      // Show warning for large files
      if (file.size > 1024 * 1024) { // If file is larger than 1MB
        toast({
          title: "Processing large document",
          description: "Large documents may take longer to process. Please be patient.",
          duration: 5000
        });
      }
      
      // Set a timeout to detect stalled requests
      const uploadTimeoutId = setTimeout(() => {
        toast({
          title: "Upload taking longer than expected",
          description: "Processing continues in the background. You can continue using the chat.",
          duration: 10000
        });
      }, 15000); // 15 seconds
      
      try {
        await onUploadDocument(file);
        
        // Clear the timeout if upload completes successfully
        clearTimeout(uploadTimeoutId);
        
        toast({
          title: "Document uploaded",
          description: `${file.name} has been uploaded and will be used for context.`
        });
      } catch (error) {
        // Clear the timeout if upload fails
        clearTimeout(uploadTimeoutId);
        throw error;
      }
      
      // Reset the file input
      if (documentInputRef.current) {
        documentInputRef.current.value = '';
      }
    } catch (error) {
      console.error("Error uploading document:", error);
      
      // Handle different error types
      if (error instanceof Error) {
        if (error.message.includes("502") || error.message.includes("timeout") || error.message.includes("network")) {
          toast({
            variant: "destructive",
            title: "Server timeout",
            description: "The document may be too large for processing. Try splitting it into smaller files or using plain text format.",
            duration: 8000
          });
        } else {
          toast({
            variant: "destructive",
            title: "Upload failed",
            description: error.message,
            duration: 5000
          });
        }
      } else {
        toast({
          variant: "destructive",
          title: "Upload failed",
          description: "Failed to upload document. Try a smaller or different format file.",
          duration: 5000
        });
      }
    } finally {
      setUploadingDocument(false);
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
  
  // Handle clipboard paste for images
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      // Skip if we're already loading
      if (isLoading || uploadingDocument) return;
      
      // Only process if we have clipboard items
      if (!e.clipboardData || !e.clipboardData.items) return;
      
      const items = e.clipboardData.items;
      let imageItem = null;
      
      // Find the first image item in the clipboard
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          imageItem = items[i];
          break;
        }
      }
      
      // If we found an image, process it
      if (imageItem) {
        // Prevent default paste behavior for images
        e.preventDefault();
        
        // Get the file from the clipboard
        const file = imageItem.getAsFile();
        if (!file) return;
        
        // Switch to multimodal model automatically
        if (selectedModel !== 'multimodal') {
          setSelectedModel('multimodal');
        }
        
        // Process the image as if it was uploaded
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
    
    // Add paste event listener to the document
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [isLoading, uploadingDocument, selectedModel, setSelectedModel]);
  
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
    <div className="border-t border-border p-4 sticky bottom-0 bg-background">
      <div className="max-w-4xl mx-auto">
        {/* Camera Dialog */}
        <Dialog open={cameraModalOpen} onOpenChange={open => !open && closeCamera()}>
          <DialogContent className="sm:max-w-md w-[95vw] max-h-[90dvh] overflow-hidden">
            <DialogHeader className="p-4 pb-0">
              <DialogTitle>Take a Photo</DialogTitle>
              <DialogDescription>
                Center your subject in the frame and click the capture button.
              </DialogDescription>
            </DialogHeader>
            {/* Use the enhanced CameraView component */}
            <CameraView 
              onClose={closeCamera} 
              onCapture={(imageData: string) => {
                // Process the captured image
                const img = document.createElement('img');
                img.onload = () => {
                  processImage(img);
                  closeCamera();
                };
                img.src = imageData;
              }} 
            />
          </DialogContent>
        </Dialog>
        
        {/* Model presets - the new single control for model selection */}
        <ModelPresets />
        
        {/* Display uploaded documents */}
        {documents.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {documents.map((doc) => (
              <DocumentItem
                key={doc.id}
                id={doc.id}
                fileName={doc.fileName}
                fileType={doc.fileType}
                fileSize={doc.fileSize}
                onPreview={() => onPreviewDocument?.(doc)}
                showRemove={false}
              />
            ))}
          </div>
        )}
        
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
            className={`w-full p-3 ${selectedModel === 'multimodal' ? 'pr-[124px]' : 'pr-[84px]'} min-h-[44px] max-h-[200px] resize-none border-border rounded-lg focus:ring-2 focus:ring-primary/50`}
            disabled={isLoading || uploadingDocument}
          />
          
          {/* Single file input with dynamic accept attribute based on model type */}
          {onUploadDocument && (
            <input
              type="file"
              ref={documentInputRef}
              onChange={selectedModel === 'multimodal' ? handleContentUpload : handleDocumentUpload}
              accept={selectedModel === 'multimodal' ? multimodalAcceptTypes : documentAcceptTypes}
              className="hidden"
              id="document-upload"
            />
          )}
          
          {/* Camera button for multimodal model */}
          {selectedModel === 'multimodal' && !selectedImage && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="relative">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="absolute right-12 bottom-3 text-muted-foreground hover:text-primary transition-colors z-0"
                      disabled={isLoading || uploadingDocument}
                      onClick={hasCredits ? startCamera : handleLockedFeatureClick}
                      data-testid="camera-button" /* For easier testing */
                      id="camera-button" /* For easier DOM selection */
                    >
                      <Camera size={18} />
                    </Button>
                    
                    {/* Padlock overlay for locked camera feature */}
                    {!hasCredits && (
                      <div 
                        className="absolute right-12 bottom-3 w-9 h-9 bg-black/50 backdrop-blur-[1px] rounded flex items-center justify-center cursor-pointer z-10"
                        onClick={handleLockedFeatureClick}
                        title="You need funds to use the camera. Click to add funds."
                      >
                        <Lock className="w-4 h-4 text-white/90" />
                      </div>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  {hasCredits 
                    ? <p>Take a photo with your camera</p>
                    : <p>Add funds to use camera (premium feature)</p>
                  }
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          
          {/* Document upload button (paperclip) - always visible */}
          {onUploadDocument && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="relative">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className={`absolute ${selectedModel === 'multimodal' ? 'right-[84px]' : 'right-[42px]'} bottom-3 text-muted-foreground hover:text-primary transition-colors z-0`}
                      disabled={isLoading || uploadingDocument}
                      onClick={hasCredits ? () => documentInputRef.current?.click() : handleLockedFeatureClick}
                    >
                      {uploadingDocument ? (
                        <div className="h-4 w-4 border-2 border-t-transparent border-primary animate-spin rounded-full" />
                      ) : (
                        <Paperclip size={18} />
                      )}
                    </Button>
                    
                    {/* Padlock overlay for locked document upload feature */}
                    {!hasCredits && (
                      <div 
                        className={`absolute ${selectedModel === 'multimodal' ? 'right-[84px]' : 'right-[42px]'} bottom-3 w-9 h-9 bg-black/50 backdrop-blur-[1px] rounded flex items-center justify-center cursor-pointer z-10`}
                        onClick={handleLockedFeatureClick}
                        title="You need funds to upload documents. Click to add funds."
                      >
                        <Lock className="w-4 h-4 text-white/90" />
                      </div>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  {hasCredits 
                    ? <p>{selectedModel === 'multimodal' 
                        ? 'Upload content (images, documents, audio, video) - Max 50MB' 
                        : 'Upload document (PDF, DOCX, TXT) - Max 50MB'}
                      </p>
                    : <p>Add funds to upload documents (premium feature)</p>
                  }
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          
          {/* Send button */}
          <Button
            type="submit"
            size="icon"
            variant="ghost"
            className="absolute right-3 bottom-3 text-primary hover:text-primary/80 transition-colors"
            disabled={(isLoading || (!message.trim() && !selectedImage) || uploadingDocument)}
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
