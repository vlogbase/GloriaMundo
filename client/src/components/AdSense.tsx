import { useEffect, useRef, useState } from 'react';

interface AdSenseProps {
  adSlot: string;
  adFormat?: 'auto' | 'rectangle' | 'horizontal' | 'vertical';
  style?: React.CSSProperties;
  className?: string;
}

export const AdSense = ({ 
  adSlot, 
  adFormat = 'auto', 
  style = {}, 
  className = '' 
}: AdSenseProps) => {
  const adRef = useRef<HTMLDivElement>(null);
  const [isAdVisible, setIsAdVisible] = useState(false);

  // Set up the intersection observer to load ads only when they enter the viewport
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setIsAdVisible(true);
            // Once the ad is visible, we can stop observing
            if (adRef.current) {
              observer.unobserve(adRef.current);
            }
          }
        });
      },
      { threshold: 0.1 } // Trigger when at least 10% of the ad is visible
    );

    if (adRef.current) {
      observer.observe(adRef.current);
    }

    return () => {
      if (adRef.current) {
        observer.unobserve(adRef.current);
      }
    };
  }, []);

  // Only initialize the ad when it becomes visible
  useEffect(() => {
    if (isAdVisible && process.env.NODE_ENV === 'production') {
      try {
        // Add the ad after component is visible
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (e) {
        console.error('AdSense error:', e);
      }
    }
  }, [isAdVisible]);

  return (
    <div ref={adRef} className={`ad-container ${className}`} style={style}>
      {isAdVisible && (
        <ins
          className="adsbygoogle"
          style={{
            display: 'block',
            ...style
          }}
          data-ad-client="ca-pub-7172335237355312"
          data-ad-slot={adSlot}
          data-ad-format={adFormat}
          data-full-width-responsive="true"
        />
      )}
    </div>
  );
};

// Add this to the global Window interface
declare global {
  interface Window {
    adsbygoogle: any[];
  }
}