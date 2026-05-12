import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, XCircle, AlertTriangle, CheckCircle } from 'lucide-react';
import { useTranslation } from '../../i18n';

export default function DeleteProgressModal({ visible, phase, logs, total, onConfirm, onClose }) {
  const { t } = useTranslation();
  const logsRef = useRef(null);

  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs]);

  const isConfirm = phase === 'confirm';
  const isDone = phase === 'done';
  const isInterrupted = phase === 'interrupted';

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="bg-surface-primary border border-border-primary rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            isConfirm ? 'bg-danger-surface' :
            isDone ? 'bg-success-surface' :
            isInterrupted ? 'bg-warning-surface' :
            'bg-brand-surface'
          }`}>
            {isConfirm ? <AlertTriangle size={20} className="text-danger" /> :
             isDone ? <CheckCircle size={20} className="text-success" /> :
             isInterrupted ? <XCircle size={20} className="text-warning" /> :
             <Trash2 size={20} className="text-brand" />}
          </div>
          <div>
            <h3 className="text-base font-bold text-text-primary">
              {isConfirm ? t('maintenance.deleteConfirmTitle') :
               isDone ? t('maintenance.deleteDone') :
               isInterrupted ? t('maintenance.deleteInterrupted') :
               t('maintenance.deleting')}
            </h3>
            <p className="text-xs text-text-secondary mt-0.5">
              {isConfirm ? t('maintenance.deleteConfirm', { count: total }) :
               isDone ? '' :
               isInterrupted ? t('maintenance.deleteInterruptedDesc') :
               ''}
            </p>
          </div>
        </div>

        {/* 日志瀑布流 */}
        {!isConfirm && (
          <div
            ref={logsRef}
            className="h-52 overflow-y-auto rounded-xl bg-bg-secondary border border-border-primary p-3 mb-5 space-y-0.5"
            style={{
              maskImage: 'linear-gradient(to bottom, transparent 0%, black 6%, black 94%, transparent 100%)',
              WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 6%, black 94%, transparent 100%)',
            }}
          >
            <AnimatePresence initial={false}>
              {logs.map((log, index) => (
                <motion.div
                  key={`${log.id}-${index}`}
                  initial={{ opacity: 0, y: -8, backgroundColor: 'rgba(59, 130, 246, 0.08)' }}
                  animate={{ opacity: 1, y: 0, backgroundColor: 'transparent' }}
                  transition={{ duration: 0.35, ease: 'easeOut' }}
                  className="flex items-center gap-2 text-xs font-mono px-2 py-1 rounded-lg"
                >
                  <span className="text-text-muted w-10">#{log.id}</span>
                  {log.status === 'success' ? (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-success flex-shrink-0" />
                      <span className="text-success-muted">{t('maintenance.deleted')}</span>
                    </>
                  ) : (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-danger flex-shrink-0" />
                      <span className="text-danger-muted">{t('maintenance.deleteError')}</span>
                    </>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
            {!isDone && !isInterrupted && logs.length < total && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2 text-xs text-text-muted px-2 py-1"
              >
                <div className="w-3 h-3 border-2 border-brand-muted border-t-brand rounded-full animate-spin flex-shrink-0" />
                <span className="font-mono">{t('common.loading')}</span>
              </motion.div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex gap-2">
          {isConfirm ? (
            <>
              <button
                onClick={onClose}
                className="flex-1 py-2.5 text-sm font-medium rounded-xl bg-surface-secondary text-text-secondary hover:bg-surface-tertiary transition-colors border border-border-primary"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={onConfirm}
                className="flex-1 py-2.5 text-sm font-semibold rounded-xl bg-danger text-text-inverse hover:bg-danger-hover transition-colors"
              >
                {t('common.delete')}
              </button>
            </>
          ) : (
            <button
              onClick={onClose}
              className="w-full py-2.5 text-sm font-semibold rounded-xl bg-brand text-text-inverse hover:bg-brand-hover transition-colors"
            >
              {t('common.confirm')}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
