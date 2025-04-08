import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { CameraOff, RotateCw, Camera } from "lucide-react";

interface CameraViewProps {
  onClose: () => void;
  onCapture: (imageData: string) => void;
}

export const CameraView = ({ onClose, onCapture }: CameraViewProps) => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [currentFacingMode, setCurrentFacingMode] = useState<'user' | 'environment'>('environment');
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean>(true);
  const [isCameraSupported, setIsCameraSupported] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Function to start the camera with a specific facing mode
  const startCamera = async (facingMode: 'user' | 'environment') => {
    try {
      // Check if MediaDevices API is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setIsCameraSupported(false);
        setError("Camera API is not supported in this browser");
        return;
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode }
      });
      
      setStream(mediaStream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      
      setHasCameraPermission(true);
      setError(null);
    } catch (err) {
      console.error("Error accessing camera:", err);
      
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setHasCameraPermission(false);
          setError("Camera permission denied. Please allow camera access.");
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          setIsCameraSupported(false);
          setError("No camera found on this device.");
        } else {
          setError(`Camera error: ${err.message}`);
        }
      } else {
        setError("Unknown camera error occurred");
      }
    }
  };

  // Start camera when component mounts or facing mode changes
  useEffect(() => {
    // Initialize camera with current facing mode
    startCamera(currentFacingMode);

    // Cleanup function to stop all tracks when component unmounts
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [currentFacingMode]);

  // Handle camera switching
  const handleSwitchCamera = () => {
    // Stop current stream
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    
    // Determine the new facing mode (flip it)
    const newFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    
    // Update the facing mode state
    setCurrentFacingMode(newFacingMode);
    
    // Explicitly start the camera with the new facing mode
    startCamera(newFacingMode);
  };

  // Take photo from video stream
  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current && stream) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      // Set canvas dimensions to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // Draw video frame to canvas
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Get image data as base64 string
        const imageData = canvas.toDataURL('image/jpeg', 0.9);
        
        // Pass image data to parent component
        onCapture(imageData);
      }
    }
  };

  return (
    <div className="flex flex-col w-full max-h-[80dvh]">
      {/* Camera not supported or permission denied */}
      {(!isCameraSupported || !hasCameraPermission) && (
        <div className="flex flex-col items-center justify-center p-6 bg-muted/10 rounded-lg text-center min-h-[250px]">
          <CameraOff className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Camera not available</h3>
          <p className="text-sm text-muted-foreground mb-4">{error || "Please allow camera access or try a different browser."}</p>
          <Button onClick={onClose} variant="outline">Close</Button>
        </div>
      )}
      
      {/* Camera view */}
      {isCameraSupported && hasCameraPermission && (
        <>
          <div className="relative overflow-hidden rounded-lg bg-black">
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              className="w-full h-auto aspect-[4/3] object-cover touch-none"
            />
            {/* Hidden canvas for capturing photos */}
            <canvas ref={canvasRef} className="hidden" />
            
            {/* Overlay with guide grid for better photo composition */}
            <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 opacity-30">
              <div className="border-r border-b border-white/20"></div>
              <div className="border-r border-l border-b border-white/20"></div>
              <div className="border-l border-b border-white/20"></div>
              <div className="border-r border-t border-b border-white/20"></div>
              <div className="border-r border-l border-t border-b border-white/20"></div>
              <div className="border-l border-t border-b border-white/20"></div>
              <div className="border-r border-t border-white/20"></div>
              <div className="border-r border-l border-t border-white/20"></div>
              <div className="border-l border-t border-white/20"></div>
            </div>
          </div>
          
          <div className="flex justify-between gap-2 mt-4">
            <Button 
              onClick={onClose} 
              variant="outline"
              className="flex-1"
            >
              Cancel
            </Button>
            
            <Button 
              onClick={handleSwitchCamera} 
              variant="secondary"
              className="flex-1"
            >
              <RotateCw className="mr-1" />
              Switch
            </Button>
            
            <Button 
              onClick={capturePhoto} 
              variant="default"
              className="flex-1"
            >
              <Camera className="mr-1" />
              Capture
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

// This export style matches the rest of the components in the project