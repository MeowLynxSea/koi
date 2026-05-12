import React from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, Folder, FileText, AlertTriangle, Link2 } from 'lucide-react';
import clsx from 'clsx';
import PriorityBadge from './PriorityBadge';
import { useTranslation } from '../../../i18n';

const NodeGridCard = ({ node, currentDomain, onClick }) => {
  const { t } = useTranslation();
  const isCrossDomain = node.domain && node.domain !== currentDomain;
  return (
    <motion.button
      whileHover={{ y: -3, transition: { duration: 0.2 } }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={clsx(
        "group relative flex flex-col items-start p-5 bg-surface-primary border rounded-2xl transition-shadow duration-300 text-left w-full h-full overflow-hidden",
        isCrossDomain
          ? "border-info-border hover:border-info hover:shadow-sm"
          : "border-border-primary hover:border-brand-border hover:shadow-sm"
      )}
    >
      <div className="flex items-center gap-3 mb-3 w-full">
        <div className="p-2.5 rounded-xl bg-surface-secondary group-hover:bg-brand-surface text-text-muted group-hover:text-brand transition-colors duration-300 flex-shrink-0">
          {node.approx_children_count > 0 ? <Folder size={18} /> : <FileText size={18} />}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-text-secondary group-hover:text-brand transition-colors break-words line-clamp-2">
            {node.name || node.path.split('/').pop()}
          </h3>
          {isCrossDomain && (
            <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 text-[10px] font-mono text-info bg-info-surface border border-info-border rounded-lg">
              <Link2 size={9} /> {node.domain}://
            </span>
          )}
        </div>
        <PriorityBadge priority={node.priority} />
      </div>

      {node.disclosure && (
        <div className="w-full mb-2.5">
          <p className="text-[11px] text-warning-muted leading-snug line-clamp-2 flex items-start gap-1">
            <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" />
            <span className="font-mono">{node.disclosure}</span>
          </p>
        </div>
      )}

      <div className="w-full flex-1">
        {node.content_snippet ? (
          <p className="text-xs text-text-muted leading-relaxed line-clamp-3">{node.content_snippet}</p>
        ) : (
          <p className="text-xs text-text-muted font-mono">{t('context.noPreview')}</p>
        )}
      </div>

      <ChevronRight size={14} className="absolute bottom-5 right-5 text-brand-muted opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-1 group-hover:translate-x-0" />
    </motion.button>
  );
};

export default NodeGridCard;
