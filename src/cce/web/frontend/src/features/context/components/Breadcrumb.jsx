import React from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, Home } from 'lucide-react';
import clsx from 'clsx';

const Breadcrumb = ({ items, onNavigate }) => (
  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
    <motion.button
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      onClick={() => onNavigate('')}
      className="p-2 rounded-xl hover:bg-surface-secondary text-text-muted hover:text-brand transition-colors"
    >
      <Home size={14} />
    </motion.button>

    {items.map((crumb, i) => (
      <React.Fragment key={crumb.path}>
        <ChevronRight size={14} className="text-text-muted flex-shrink-0" />
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onNavigate(crumb.path)}
          className={clsx(
            "px-3 py-1.5 rounded-xl text-xs font-medium transition-colors whitespace-nowrap",
            i === items.length - 1
              ? "bg-brand-surface text-brand border border-brand-border"
              : "text-text-tertiary hover:text-text-secondary hover:bg-surface-secondary"
          )}
        >
          {crumb.label}
        </motion.button>
      </React.Fragment>
    ))}
  </div>
);

export default Breadcrumb;
