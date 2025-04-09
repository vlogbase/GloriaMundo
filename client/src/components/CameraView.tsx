import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { CameraOff, FlipHorizontal, Camera } from "lucide-react";

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
  const [hasMultipleCameras, setHasMultipleCameras] = useState<boolean>(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Function to start the camera with a specific facing mode - improved with constraints
  const startCamera = async (facingMode: 'user' | 'environment') => {
    try {
      console.log(`Starting camera with facing mode: ${facingMode}`);
      
      // Check if MediaDevices API is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setIsCameraSupported(false);
        setError("Camera API is not supported in this browser");
        return;
      }

      // Try to get device info to ensure camera exists with this facing mode
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      console.log(`Found ${videoDevices.length} video input devices`);
      
      // Update the hasMultipleCameras state based on device count
      setHasMultipleCameras(videoDevices.length > 1);
      
      // Use more specific constraints for better compatibility
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        },
        audio: false
      };
      
      // If there's already a stream active, ensure it's properly stopped
      if (stream) {
        console.log('Stopping any existing stream before starting new one');
        stream.getTracks().forEach(track => track.stop());
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
      }
      
      console.log('Requesting camera with constraints:', constraints);
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      console.log(`Got media stream with ${mediaStream.getVideoTracks().length} video tracks`);
      
      // Save the stream and connect it to the video element
      setStream(mediaStream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        
        // Add event listeners to handle any connection issues
        videoRef.current.onloadedmetadata = () => {
          console.log('Video metadata loaded');
          if (videoRef.current) {
            videoRef.current.play().catch(e => {
              console.error('Error playing video:', e);
            });
          }
        };
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
        } else if (err.name === 'OverconstrainedError') {
          // Try again with simpler constraints if the specified ones didn't work
          console.log('Camera constraints not satisfied, trying simpler configuration');
          try {
            // Check if multiple cameras are available, even in fallback mode
            const devicesCheck = await navigator.mediaDevices.enumerateDevices();
            const videoDevicesCheck = devicesCheck.filter(device => device.kind === 'videoinput');
            setHasMultipleCameras(videoDevicesCheck.length > 1);
            
            const simpleStream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode },
              audio: false
            });
            setStream(simpleStream);
            if (videoRef.current) {
              videoRef.current.srcObject = simpleStream;
            }
            setHasCameraPermission(true);
            setError(null);
          } catch (e) {
            setError(`Camera not available: ${e instanceof Error ? e.message : 'Unknown error'}`);
          }
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

  // Handle camera switching - improved with proper async handling
  const handleSwitchCamera = async () => {
    try {
      console.log(`Switching camera from ${currentFacingMode} mode...`);
      
      // Stop current stream
      if (stream) {
        stream.getTracks().forEach(track => {
          console.log(`Stopping track: ${track.kind}, enabled: ${track.enabled}, muted: ${track.muted}`);
          track.stop();
        });
        
        // Clear video source
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
      }
      
      // Determine the new facing mode (flip it)
      const newFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
      console.log(`Setting new facing mode to: ${newFacingMode}`);
      
      // Update the facing mode state
      setCurrentFacingMode(newFacingMode);
      
      // Small delay to ensure previous stream is fully stopped
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Explicitly start the camera with the new facing mode
      await startCamera(newFacingMode);
      
      console.log(`Camera switched to ${newFacingMode} mode successfully`);
    } catch (error) {
      console.error('Error switching camera:', error);
      setError(`Failed to switch camera: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Take photo from video stream and immediately stop camera
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
        
        // Stop all camera tracks immediately after capture
        stream.getTracks().forEach(track => {
          console.log(`Stopping camera track after capture: ${track.kind}`);
          track.stop();
        });
        
        // Clear video source
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
        
        // Clear the stream state
        setStream(null);
        
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
          
          <div className={`flex ${hasMultipleCameras ? 'justify-between' : 'justify-around'} gap-2 mt-4`}>
            <Button 
              onClick={onClose} 
              variant="outline"
              className={hasMultipleCameras ? 'flex-1' : 'w-[40%]'}
            >
              Cancel
            </Button>
            
            {/* Only show switch camera button if multiple cameras are detected */}
            {hasMultipleCameras && (
              <Button 
                onClick={handleSwitchCamera} 
                variant="secondary"
                className="flex-1"
              >
                <FlipHorizontal className="mr-1" />
                Flip
              </Button>
            )}
            
            <Button 
              onClick={capturePhoto} 
              variant="default"
              className={hasMultipleCameras ? 'flex-1' : 'w-[40%]'}
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