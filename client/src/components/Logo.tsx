import React from 'react';

interface LogoProps {
  size?: number;
  color?: string;
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({ 
  size = 40, 
  color = 'currentColor',
  className = ''
}) => {
  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg 
        width={size} 
        height={size} 
        viewBox="0 0 40 40" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="20" cy="20" r="20" fill="#2DD4BF" opacity="0.2" />
        <circle cx="20" cy="20" r="16" fill="#2DD4BF" opacity="0.4" />
        <g transform="translate(10, 10)">
          <circle cx="10" cy="10" r="10" fill="#2DD4BF" />
          <path 
            d="M10 4C6.68629 4 4 6.68629 4 10C4 13.3137 6.68629 16 10 16C13.3137 16 16 13.3137 16 10C16 6.68629 13.3137 4 10 4ZM4.8 10C4.8 7.12944 7.12944 4.8 10 4.8C12.8706 4.8 15.2 7.12944 15.2 10C15.2 12.8706 12.8706 15.2 10 15.2C7.12944 15.2 4.8 12.8706 4.8 10ZM10 7.2C9.55817 7.2 9.2 7.55817 9.2 8V10C9.2 10.4418 9.55817 10.8 10 10.8H12C12.4418 10.8 12.8 10.4418 12.8 10C12.8 9.55817 12.4418 9.2 12 9.2H10.8V8C10.8 7.55817 10.4418 7.2 10 7.2Z" 
            fill="white"
          />
        </g>
      </svg>
    </div>
  );
};

export default Logo;