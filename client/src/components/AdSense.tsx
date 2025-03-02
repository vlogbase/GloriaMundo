import { useEffect } from 'react';

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

  useEffect(() => {
    // Only add the ad if we're in production
    if (process.env.NODE_ENV === 'production') {
      try {
        // Add the ad after component mounts
        const adsbygoogle = window.adsbygoogle || [];
        adsbygoogle.push({});
      } catch (e) {
        console.error('AdSense error:', e);
      }
    }
  }, []);

  return (
    <div className={`ad-container ${className}`} style={style}>
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
    </div>
  );
};

// Add this to the global Window interface
declare global {
  interface Window {
    adsbygoogle: any[];
  }
}