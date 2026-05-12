import React from 'react';
import clsx from 'clsx';

export const Skeleton = ({ className, variant = 'rect' }) => {
  return (
    <div
      className={clsx(
        'animate-shimmer rounded-lg',
        variant === 'circle' && 'rounded-full',
        variant === 'text' && 'rounded',
        className
      )}
    />
  );
};

export const SkeletonCard = ({ lines = 3, hasHeader = true }) => (
  <div className="bg-surface-primary border border-border-primary rounded-2xl p-6 space-y-4">
    {hasHeader && (
      <div className="flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-xl" variant="rect" />
        <div className="flex-1 space-y-2">
          <Skeleton className="w-1/3 h-4" />
          <Skeleton className="w-1/4 h-3" />
        </div>
      </div>
    )}
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton key={i} className="w-full h-3" />
    ))}
  </div>
);

export const SkeletonTable = ({ rows = 5, cols = 4 }) => (
  <div className="bg-surface-primary border border-border-primary rounded-2xl overflow-hidden">
    <div className="grid gap-4 p-4 border-b border-border-primary" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} className="w-20 h-4" />
      ))}
    </div>
    {Array.from({ length: rows }).map((_, ri) => (
      <div key={ri} className="grid gap-4 p-4 border-b border-border-primary last:border-0" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {Array.from({ length: cols }).map((_, ci) => (
          <Skeleton key={ci} className="w-full h-4" style={{ width: ci === 0 ? '60%' : '80%' }} />
        ))}
      </div>
    ))}
  </div>
);

export const SkeletonSidebar = () => (
  <div className="w-64 flex-shrink-0 space-y-4 p-4">
    <Skeleton className="w-32 h-6" />
    <div className="space-y-3 pt-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="w-4 h-4 rounded" />
          <Skeleton className="w-24 h-4" />
        </div>
      ))}
    </div>
  </div>
);

export const SkeletonStats = ({ count = 4 }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="bg-surface-primary border border-border-primary rounded-2xl p-5 space-y-3">
        <Skeleton className="w-20 h-3" />
        <Skeleton className="w-16 h-8" />
        <Skeleton className="w-full h-2 rounded-full" />
      </div>
    ))}
  </div>
);
