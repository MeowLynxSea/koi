import React from 'react';
import { Star } from 'lucide-react';
import clsx from 'clsx';

const PriorityBadge = ({ priority, size = 'sm' }) => {
  if (priority === null || priority === undefined) return null;

  const colors = priority === 0
    ? 'bg-danger-surface text-danger border-danger-border'
    : priority <= 2
    ? 'bg-warning-surface text-warning border-warning-border'
    : priority <= 5
    ? 'bg-info-surface text-info border-info-border'
    : 'bg-surface-tertiary text-text-muted border-border-secondary';

  const sizeClass = size === 'lg'
    ? 'px-3 py-1 text-xs gap-1.5 rounded-lg'
    : 'px-2 py-0.5 text-[10px] gap-1 rounded-md';

  return (
    <span className={clsx("inline-flex items-center border font-mono font-semibold", colors, sizeClass)}>
      <Star size={size === 'lg' ? 12 : 9} />
      {priority}
    </span>
  );
};

export default PriorityBadge;
