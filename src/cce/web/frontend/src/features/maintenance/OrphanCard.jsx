import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import {
  ChevronDown, ChevronUp, ArrowRight,
  Archive, Unlink, CheckSquare, Square
} from 'lucide-react';

import { useTranslation } from '../../i18n';

export default function OrphanCard({
  item,
  isExpanded,
  detail,
  isLoadingDetail,
  isChecked,
  onToggle,
  onExpand,
}) {
  const { t } = useTranslation();
  const formattedDate = item.created_at
    ? format(new Date(item.created_at), 'yyyy-MM-dd HH:mm')
    : 'Unknown';

  return (
    <div className="group relative bg-surface-primary border border-border-primary hover:border-border-secondary rounded-2xl transition-colors overflow-hidden">
      <div
        className="flex items-start gap-3 p-4 sm:p-5 cursor-pointer select-none"
        onClick={() => onExpand(item.id)}
      >
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(item.id, e); }}
          className="mt-0.5 flex-shrink-0 p-1 rounded-lg transition-colors hover:bg-surface-secondary"
        >
          {isChecked
            ? <CheckSquare size={18} className="text-brand" />
            : <Square size={18} className="text-text-muted group-hover:text-text-tertiary" />
          }
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="text-[11px] font-mono text-text-secondary bg-surface-secondary px-2 py-1 rounded-lg border border-border-primary">#{item.id}</span>
            {item.category === 'deprecated' ? (
              <span className="text-[10px] font-mono text-warning bg-warning-surface px-2 py-1 rounded-lg border border-warning-border flex items-center gap-1"><Archive size={9} /> deprecated</span>
            ) : (
              <span className="text-[10px] font-mono text-danger bg-danger-surface px-2 py-1 rounded-lg border border-danger-border flex items-center gap-1"><Unlink size={9} /> orphaned</span>
            )}
            {item.migrated_to && <span className="text-[10px] font-mono text-brand bg-brand-surface px-2 py-1 rounded-lg border border-brand-border">→ #{item.migrated_to}</span>}
            <span className="text-[11px] text-text-muted">{formattedDate}</span>
          </div>

          {item.migration_target && item.migration_target.paths.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap mb-2">
              <ArrowRight size={12} className="text-brand-muted flex-shrink-0" />
              {item.migration_target.paths.map((p, i) => (
                <span key={i} className="text-[11px] font-mono text-brand bg-brand-surface px-2 py-1 rounded-lg border border-brand-border">{p}</span>
              ))}
            </div>
          )}
          {item.migration_target && item.migration_target.paths.length === 0 && (
            <div className="flex items-center gap-1.5 mb-2">
              <ArrowRight size={12} className="text-text-muted flex-shrink-0" />
              <span className="text-[11px] text-text-muted italic">{t('maintenance.targetNoPaths', { id: item.migration_target.id })}</span>
            </div>
          )}

          <div className="bg-surface-secondary rounded-xl p-3 text-[12px] text-text-secondary font-mono leading-relaxed line-clamp-3 border border-border-primary">
            {item.content_snippet}
          </div>
        </div>

        <div className="mt-1 flex-shrink-0 text-text-muted transition-transform duration-300">
          {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-border-primary p-4 sm:p-6 bg-bg-secondary">
              {isLoadingDetail ? (
                <div className="flex items-center gap-3 text-text-muted py-4">
                  <div className="w-4 h-4 border-2 border-brand-muted border-t-brand rounded-full animate-spin"></div>
                  <span className="text-xs">{t('maintenance.loadingDetail')}</span>
                </div>
              ) : detail?.error ? (
                <div className="text-danger text-xs py-2">{t('common.error')}: {detail.error}</div>
              ) : detail ? (
                <div className="space-y-5">
                  <div>
                    <h4 className="text-[11px] uppercase tracking-widest text-text-muted mb-3 font-semibold">
                      {detail.migration_target ? t('maintenance.oldVersion') : t('maintenance.fullContent')}
                    </h4>
                    <div className="bg-bg-primary rounded-xl p-4 sm:p-5 border border-border-primary text-[12px] text-text-secondary font-mono leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto custom-scrollbar">
                      {detail.content}
                    </div>
                  </div>
                  {detail.migration_target && (
                    <div>
                      <h4 className="text-[11px] uppercase tracking-widest text-text-muted mb-3 font-semibold flex items-center gap-2">
                        <span>{t('maintenance.diffTitle', { from: item.id, to: detail.migration_target.id })}</span>
                        {detail.migration_target.paths.length > 0 && (
                          <span className="text-brand-muted normal-case tracking-normal font-normal">
                            ({detail.migration_target.paths[0]})
                          </span>
                        )}
                      </h4>
                      <div className="bg-bg-primary rounded-xl border border-border-primary p-4 sm:p-5 max-h-96 overflow-y-auto custom-scrollbar space-y-4">
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">Old</div>
                          <div className="text-[12px] text-text-secondary font-mono leading-relaxed whitespace-pre-wrap">{detail.content}</div>
                        </div>
                        <div className="border-t border-border-primary pt-4">
                          <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">New</div>
                          <div className="text-[12px] text-text-secondary font-mono leading-relaxed whitespace-pre-wrap">{detail.migration_target.content}</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
