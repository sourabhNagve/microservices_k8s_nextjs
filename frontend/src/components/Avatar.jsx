'use client';

import { useState } from 'react';
import Image from 'next/image';
import { getInitials, generateAvatarColors, isValidImageUrl } from '@/utils/imageUtils';

export default function Avatar({ 
  src, 
  alt, 
  name, 
  size = 'md', 
  showStatus = false, 
  statusColor = 'green',
  className = '',
  fallback = null 
}) {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const sizes = {
    xs: { width: 24, height: 24, className: 'w-6 h-6 text-xs' },
    sm: { width: 32, height: 32, className: 'w-8 h-8 text-sm' },
    md: { width: 40, height: 40, className: 'w-10 h-10 text-sm' },
    lg: { width: 48, height: 48, className: 'w-12 h-12 text-base' },
    xl: { width: 64, height: 64, className: 'w-16 h-16 text-lg' },
    '2xl': { width: 96, height: 96, className: 'w-24 h-24 text-xl' },
  };

  const statusColors = {
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
    gray: 'bg-gray-400',
    blue: 'bg-blue-500',
  };

  const currentSize = sizes[size] || sizes.md;
  const avatarColors = generateAvatarColors(name || alt || 'User');
  const initials = getInitials(name || alt || 'User');
  const hasValidSrc = src && isValidImageUrl(src) && !imageError;

  const handleImageError = () => {
    setImageError(true);
  };

  const handleImageLoad = () => {
    setImageLoaded(true);
  };

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <div className={`relative ${currentSize.className} rounded-full overflow-hidden bg-gradient-to-br ${avatarColors} flex items-center justify-center text-white font-semibold shadow-lg`}>
        {hasValidSrc ? (
          <>
            <Image
              src={src}
              alt={alt || name || 'User avatar'}
              width={currentSize.width}
              height={currentSize.height}
              className="object-cover"
              onError={handleImageError}
              onLoad={handleImageLoad}
              style={{ opacity: imageLoaded ? 1 : 0 }}
            />
            {!imageLoaded && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              </div>
            )}
          </>
        ) : (
          <span className="select-none">{initials}</span>
        )}
      </div>
      
      {showStatus && (
        <div 
          className={`absolute -bottom-0 -right-0 w-3 h-3 ${statusColors[statusColor] || statusColors.green} rounded-full border-2 border-white dark:border-gray-800`}
        ></div>
      )}
    </div>
  );
}

// Usage examples:
// <Avatar src="https://example.com/avatar.jpg" name="John Doe" size="md" showStatus />
// <Avatar name="Jane Smith" size="lg" />
// <Avatar src="invalid-url" name="Fallback" size="xl" fallback="/default-avatar.png" />
