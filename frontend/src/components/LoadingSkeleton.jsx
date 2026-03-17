'use client';

export const ProductCardSkeleton = () => (
  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
    <div className="loading-skeleton h-48"></div>
    <div className="p-4 space-y-3">
      <div className="loading-skeleton h-4 w-3/4 rounded"></div>
      <div className="loading-skeleton h-3 w-full rounded"></div>
      <div className="loading-skeleton h-3 w-2/3 rounded"></div>
      <div className="flex justify-between items-center">
        <div className="loading-skeleton h-6 w-20 rounded"></div>
        <div className="loading-skeleton h-8 w-24 rounded"></div>
      </div>
    </div>
  </div>
);

export const CartItemSkeleton = () => (
  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700">
    <div className="flex gap-6">
      <div className="loading-skeleton w-24 h-24 rounded-lg"></div>
      <div className="flex-1 space-y-3">
        <div className="loading-skeleton h-5 w-3/4 rounded"></div>
        <div className="loading-skeleton h-4 w-1/2 rounded"></div>
        <div className="flex justify-between items-center">
          <div className="loading-skeleton h-8 w-32 rounded"></div>
          <div className="loading-skeleton h-6 w-20 rounded"></div>
        </div>
      </div>
    </div>
  </div>
);

export const ButtonSkeleton = ({ className = "" }) => (
  <div className={`loading-skeleton h-10 w-full rounded-lg ${className}`}></div>
);

export const TextSkeleton = ({ lines = 1, className = "" }) => (
  <div className={`space-y-2 ${className}`}>
    {[...Array(lines)].map((_, i) => (
      <div key={i} className="loading-skeleton h-4 rounded" style={{ width: `${Math.random() * 40 + 60}%` }}></div>
    ))}
  </div>
);

export const AvatarSkeleton = ({ size = "md" }) => {
  const sizes = {
    sm: "w-8 h-8",
    md: "w-12 h-12", 
    lg: "w-16 h-16",
    xl: "w-20 h-20"
  };
  
  return <div className={`loading-skeleton ${sizes[size]} rounded-full`}></div>;
};

export const TableSkeleton = ({ rows = 5, columns = 4 }) => (
  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
    <div className="p-4 space-y-3">
      {/* Header */}
      <div className="flex gap-4 pb-3 border-b border-gray-200 dark:border-gray-700">
        {[...Array(columns)].map((_, i) => (
          <div key={i} className="loading-skeleton h-4 flex-1 rounded"></div>
        ))}
      </div>
      
      {/* Rows */}
      {[...Array(rows)].map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4">
          {[...Array(columns)].map((_, colIndex) => (
            <div key={colIndex} className="loading-skeleton h-3 flex-1 rounded"></div>
          ))}
        </div>
      ))}
    </div>
  </div>
);

export const CardSkeleton = ({ children }) => (
  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700">
    <div className="space-y-3">
      <div className="loading-skeleton h-6 w-3/4 rounded"></div>
      <div className="loading-skeleton h-4 w-full rounded"></div>
      <div className="loading-skeleton h-4 w-2/3 rounded"></div>
      {children}
    </div>
  </div>
);

export const PageSkeleton = () => (
  <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-blue-900">
    {/* Header Skeleton */}
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="loading-skeleton h-8 w-32 rounded"></div>
          <div className="flex space-x-4">
            <div className="loading-skeleton h-8 w-16 rounded"></div>
            <div className="loading-skeleton h-8 w-16 rounded"></div>
            <div className="loading-skeleton h-8 w-16 rounded"></div>
          </div>
        </div>
      </div>
    </div>

    {/* Content Skeleton */}
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="px-4 py-6 sm:px-0">
        <div className="space-y-8">
          {/* Title Skeleton */}
          <div className="space-y-2">
            <div className="loading-skeleton h-10 w-48 rounded"></div>
            <div className="loading-skeleton h-4 w-96 rounded"></div>
          </div>

          {/* Grid Skeleton */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
);

export const LoadingSpinner = ({ size = "md", className = "" }) => {
  const sizes = {
    sm: "w-4 h-4",
    md: "w-6 h-6", 
    lg: "w-8 h-8",
    xl: "w-12 h-12"
  };
  
  return (
    <div className={`animate-spin ${sizes[size]} border-2 border-gray-200 border-t-blue-600 rounded-full ${className}`}></div>
  );
};

export const LoadingDots = ({ className = "" }) => (
  <div className={`flex space-x-1 ${className}`}>
    <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
    <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
    <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
  </div>
);

export const ProgressBar = ({ progress = 0, className = "" }) => (
  <div className={`w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 ${className}`}>
    <div 
      className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
      style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
    ></div>
  </div>
);

export const SkeletonLoader = ({ children, isLoading, skeleton, className = "" }) => {
  if (isLoading) {
    return <div className={className}>{skeleton}</div>;
  }
  
  return <div className={className}>{children}</div>;
};
