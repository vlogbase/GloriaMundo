import React, { memo } from 'react';
import { cn } from '@/lib/utils';

interface LogoProps {
  size?: number;
  showText?: boolean;
  className?: string;
  onClick?: () => void;
}

// Using memo to avoid unnecessary re-renders
export const Logo: React.FC<LogoProps> = memo(({ 
  size = 40, 
  showText = false,
  className = '',
  onClick
}) => {
  return (
    <div 
      className={cn(
        "relative inline-flex items-center", 
        className, 
        onClick && "cursor-pointer"
      )} 
      onClick={onClick}
      aria-label="GloriaMundo Logo"
    >
      <picture>
        <source srcSet="/images/logo.webp" type="image/webp" />
        <source srcSet="/images/logo.png" type="image/png" />
        <img 
          src="/images/logo.png" 
          alt="GloriaMundo Logo" 
          width={size} 
          height={size} 
          className="object-contain"
          loading={size > 48 ? "lazy" : "eager"} // Eager load small logos (likely above-the-fold)
          decoding="async"
        />
      </picture>
      {showText && (
        <span className="ml-2 font-semibold text-xl text-primary">GloriaMundo</span>
      )}
    </div>
  );
});

// Add display name for debugging
Logo.displayName = 'Logo';

export default Logo;