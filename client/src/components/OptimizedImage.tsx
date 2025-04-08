import { useState, useRef, useEffect } from 'react';

interface OptimizedImageProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  style?: React.CSSProperties;
  priority?: boolean;
  onLoad?: () => void;
  onError?: () => void;
}

/**
 * OptimizedImage Component
 * 
 * Features:
 * - Lazy loading with IntersectionObserver
 * - Automatic WebP loading with fallback
 * - Placeholder during loading
 * - Priority loading for above-the-fold images
 * - Error handling with fallback UI
 */
export const OptimizedImage = ({
  src,
  alt,
  width,
  height,
  className = '',
  style = {},
  priority = false,
  onLoad,
  onError
}: OptimizedImageProps) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isVisible, setIsVisible] = useState(priority);
  const imgRef = useRef<HTMLImageElement>(null);

  // Generate WebP source if original is not WebP
  const getWebPSource = (originalSrc: string): string | null => {
    // Don't convert if already WebP, SVG, or data URL
    if (originalSrc.endsWith('.webp') || 
        originalSrc.endsWith('.svg') || 
        originalSrc.startsWith('data:')) {
      return null;
    }
    
    // Replace extension with .webp
    const lastDotIndex = originalSrc.lastIndexOf('.');
    if (lastDotIndex > 0) {
      return `${originalSrc.substring(0, lastDotIndex)}.webp`;
    }
    
    // If no extension, just append .webp
    return `${originalSrc}.webp`;
  };
  
  const webpSrc = getWebPSource(src);
  
  // Set up IntersectionObserver for lazy loading
  useEffect(() => {
    // Skip for priority images - load immediately
    if (priority) {
      return;
    }
    
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            if (imgRef.current) {
              observer.unobserve(imgRef.current);
            }
          }
        });
      },
      {
        rootMargin: '200px', // Start loading when image is 200px from viewport
        threshold: 0.01 // Trigger when at least 1% of the image is visible
      }
    );
    
    if (imgRef.current) {
      observer.observe(imgRef.current);
    }
    
    return () => {
      if (imgRef.current) {
        observer.unobserve(imgRef.current);
      }
    };
  }, [priority]);
  
  // Handle successful image load
  const handleLoad = () => {
    setIsLoaded(true);
    setHasError(false);
    onLoad?.();
  };
  
  // Handle image load error
  const handleError = () => {
    setHasError(true);
    setIsLoaded(true); // Still mark as "loaded" to remove placeholder
    onError?.();
  };

  return (
    <div 
      className={`relative ${className}`} 
      style={{ 
        width: width ? `${width}px` : '100%', 
        height: height ? `${height}px` : 'auto',
        ...style 
      }}
      ref={imgRef}
    >
      {/* Loading placeholder */}
      {!isLoaded && (
        <div 
          className="absolute inset-0 bg-muted/20 animate-pulse rounded" 
          style={{ 
            width: width ? `${width}px` : '100%', 
            height: height ? `${height}px` : '100%' 
          }}
        />
      )}
      
      {/* Error fallback */}
      {hasError && (
        <div 
          className="absolute inset-0 bg-muted/10 flex items-center justify-center"
          style={{ 
            width: width ? `${width}px` : '100%', 
            height: height ? `${height}px` : '100%' 
          }}
        >
          <div className="text-center p-4 text-sm text-muted-foreground">
            <svg 
              className="w-10 h-10 mx-auto mb-2 text-muted-foreground/50" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24" 
              xmlns="http://www.w3.org/2000/svg"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
              />
            </svg>
            <span>{alt || 'Image failed to load'}</span>
          </div>
        </div>
      )}
      
      {/* Only load actual image when in viewport (or for priority images) */}
      {isVisible && (
        <picture>
          {/* WebP source if available */}
          {webpSrc && <source srcSet={webpSrc} type="image/webp" />}
          
          {/* Original image as fallback */}
          <img
            src={src}
            alt={alt}
            width={width}
            height={height}
            onLoad={handleLoad}
            onError={handleError}
            loading={priority ? "eager" : "lazy"}
            className={`${isLoaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300 ${hasError ? 'hidden' : ''}`}
            style={{ 
              width: width ? `${width}px` : '100%', 
              height: height ? `${height}px` : 'auto',
              objectFit: 'contain'
            }}
          />
        </picture>
      )}
    </div>
  );
};