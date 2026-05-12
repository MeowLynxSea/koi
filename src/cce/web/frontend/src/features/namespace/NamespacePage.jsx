import React, { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import {
  Tag, Trash2, RefreshCw, AlertTriangle, Pencil, Plus,
  Check, X, ArrowRightLeft, FolderTree, Database, Layers,
  Globe, BookOpen, Link2, Loader2
} from 'lucide-react';
import { getNamespaceStats, deleteNamespace, renameNamespace } from '../../lib/api';
import { useTranslation } from '../../i18n';

function ConfirmModal({ visible, title, message, onConfirm, onClose, confirmText, danger, isLoading }) {
  if (!visible) return null;
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
        onClick={isLoading ? undefined : onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          className="bg-surface-primary border border-border-primary rounded-2xl p-6 max-w-md w-full mx-4 shadow-xl"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className={clsx("w-10 h-10 rounded-xl flex items-center justify-center", danger ? "bg-danger-surface" : "bg-warning-surface")}>
              <AlertTriangle size={20} className={danger ? "text-danger" : "text-warning"} />
            </div>
            <h3 className="text-base font-semibold text-text-primary">{title}</h3>
          </div>
          <p className="text-sm text-text-secondary mb-6 leading-relaxed">{message}</p>
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-secondary rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {useTranslation().t('common.cancel')}
            </button>
            <button
              onClick={onConfirm}
              disabled={isLoading}
              className={clsx(
                "px-4 py-2 text-sm font-medium rounded-xl transition-all btn-press flex items-center gap-2",
                danger
                  ? "bg-danger text-text-inverse hover:bg-danger-hover"
                  : "bg-brand text-text-inverse hover:bg-brand-hover"
              )}
            >
              {isLoading && <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
              {confirmText}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function RenameModal({ visible, namespace, onConfirm, onClose, isLoading }) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');

  useEffect(() => {
    if (visible) setValue(namespace?.name ?? '');
  }, [visible, namespace]);

  if (!visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
        onClick={isLoading ? undefined : onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          className="bg-surface-primary border border-border-primary rounded-2xl p-6 max-w-md w-full mx-4 shadow-xl"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-brand-surface flex items-center justify-center">
              <Pencil size={18} className="text-brand" />
            </div>
            <h3 className="text-base font-semibold text-text-primary">{t('namespace.renameTitle')}</h3>
          </div>
          <div className="mb-6">
            <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
              {t('namespace.newName')}
            </label>
            <input
              autoFocus
              type="text"
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !isLoading) onConfirm(value); if (e.key === 'Escape') onClose(); }}
              disabled={isLoading}
              className="w-full bg-surface-secondary border border-border-primary text-text-primary rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-brand transition-all disabled:opacity-50"
              placeholder={t('app.namespace.placeholder')}
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-secondary rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={() => onConfirm(value)}
              disabled={!value.trim() || value.trim() === namespace?.name || isLoading}
              className="px-4 py-2 text-sm font-medium rounded-xl bg-brand text-text-inverse hover:bg-brand-hover transition-all disabled:opacity-40 disabled:cursor-not-allowed btn-press flex items-center gap-2"
            >
              {isLoading && <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
              {t('common.save')}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function CreateModal({ visible, onConfirm, onClose, isLoading }) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');

  useEffect(() => {
    if (visible) setValue('');
  }, [visible]);

  if (!visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
        onClick={isLoading ? undefined : onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          className="bg-surface-primary border border-border-primary rounded-2xl p-6 max-w-md w-full mx-4 shadow-xl"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-success-surface flex items-center justify-center">
              <Plus size={20} className="text-success" />
            </div>
            <h3 className="text-base font-semibold text-text-primary">{t('namespace.createTitle')}</h3>
          </div>
          <div className="mb-6">
            <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
              {t('namespace.name')}
            </label>
            <input
              autoFocus
              type="text"
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !isLoading) onConfirm(value); if (e.key === 'Escape') onClose(); }}
              disabled={isLoading}
              className="w-full bg-surface-secondary border border-border-primary text-text-primary rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-brand transition-all disabled:opacity-50"
              placeholder={t('app.namespace.placeholder')}
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-secondary rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={() => onConfirm(value)}
              disabled={!value.trim() || isLoading}
              className="px-4 py-2 text-sm font-medium rounded-xl bg-brand text-text-inverse hover:bg-brand-hover transition-all disabled:opacity-40 disabled:cursor-not-allowed btn-press flex items-center gap-2"
            >
              {isLoading && <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
              {t('common.create')}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default function NamespacePage() {
  const { t } = useTranslation();
  const [namespaces, setNamespaces] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [confirmModal, setConfirmModal] = useState({ visible: false, ns: null });
  const [renameModal, setRenameModal] = useState({ visible: false, ns: null });
  const [createModal, setCreateModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [popoverPos, setPopoverPos] = useState(null);
  const popoverRef = useRef(null);
  const hideTimerRef = useRef(null);

  const showPopover = useCallback((pos) => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setPopoverPos(pos);
  }, []);

  const hidePopover = useCallback(() => {
    hideTimerRef.current = setTimeout(() => {
      setPopoverPos(null);
      hideTimerRef.current = null;
    }, 150);
  }, []);

  useEffect(() => { loadNamespaces(); }, []);

  useEffect(() => {
    function handleClickOutside(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        if (hideTimerRef.current) {
          clearTimeout(hideTimerRef.current);
          hideTimerRef.current = null;
        }
        setPopoverPos(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  const loadNamespaces = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getNamespaceStats();
      setNamespaces(data);
    } catch (err) {
      setError(t('namespace.error') + ': ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const handleDelete = useCallback(async () => {
    const ns = confirmModal.ns;
    if (!ns) return;
    setIsDeleting(true);
    try {
      await deleteNamespace(ns.name);
      setNamespaces(prev => prev.filter(n => n.name !== ns.name));
      // If the deleted namespace was the currently selected one, clear it
      const selected = localStorage.getItem('selected_namespace') ?? '';
      if (selected === ns.name) {
        localStorage.removeItem('selected_namespace');
      }
    } catch (err) {
      setError(t('namespace.deleteFailed') + ': ' + (err.response?.data?.detail || err.message));
    } finally {
      setIsDeleting(false);
      setConfirmModal({ visible: false, ns: null });
    }
  }, [confirmModal, t]);

  const handleRename = useCallback(async (newName) => {
    const ns = renameModal.ns;
    if (!ns || !newName.trim()) return;
    setIsRenaming(true);
    try {
      await renameNamespace(ns.name, newName.trim());
      setNamespaces(prev => prev.map(n => n.name === ns.name ? { ...n, name: newName.trim() } : n));
      // If the renamed namespace was the currently selected one, update it
      const selected = localStorage.getItem('selected_namespace') ?? '';
      if (selected === ns.name) {
        localStorage.setItem('selected_namespace', newName.trim());
      }
    } catch (err) {
      setError(t('namespace.renameFailed') + ': ' + (err.response?.data?.detail || err.message));
    } finally {
      setIsRenaming(false);
      setRenameModal({ visible: false, ns: null });
    }
  }, [renameModal, t]);

  const handleCreate = useCallback((name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    localStorage.setItem('selected_namespace', trimmed);
    window.location.reload();
  }, []);

  const switchToNamespace = useCallback((name) => {
    if (name) localStorage.setItem('selected_namespace', name);
    else localStorage.removeItem('selected_namespace');
    window.location.reload();
  }, []);

  const currentNs = localStorage.getItem('selected_namespace') ?? '';

  const transition = { duration: 0.35, ease: [0.16, 1, 0.3, 1] };

  return (
    <div className="flex h-full bg-bg-primary text-text-primary overflow-hidden relative">
      <ConfirmModal
        visible={confirmModal.visible}
        title={t('namespace.deleteConfirmTitle')}
        message={t('namespace.deleteConfirm', { name: confirmModal.ns?.name || t('app.namespace.default') })}
        confirmText={t('common.delete')}
        danger
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onClose={() => setConfirmModal({ visible: false, ns: null })}
      />
      <RenameModal
        visible={renameModal.visible}
        namespace={renameModal.ns}
        isLoading={isRenaming}
        onConfirm={handleRename}
        onClose={() => setRenameModal({ visible: false, ns: null })}
      />
      <CreateModal
        visible={createModal}
        isLoading={false}
        onConfirm={handleCreate}
        onClose={() => setCreateModal(false)}
      />

      <main className="flex-1 flex flex-col min-w-0 bg-bg-primary relative overflow-hidden">
        {/* Floating action buttons */}
        <div className="absolute top-4 right-4 sm:top-6 sm:right-6 lg:top-8 lg:right-8 z-20 flex items-center gap-2">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setCreateModal(true)}
            className="flex items-center gap-1.5 px-3 sm:px-4 py-2 text-xs font-semibold rounded-xl bg-brand-surface text-brand hover:bg-brand-surface border border-brand-border transition-all btn-press"
          >
            <Plus size={14} />
            <span className="hidden sm:inline">{t('namespace.create')}</span>
          </motion.button>
          <motion.button whileTap={{ scale: 0.95 }} onClick={loadNamespaces} className="p-2.5 text-text-tertiary hover:text-brand hover:bg-surface-secondary rounded-xl transition-all" title={t('common.refresh')}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </motion.button>
        </div>

        <div className="flex-1 relative overflow-hidden">
          {error ? (
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-danger bg-danger-surface border border-danger-border p-6 rounded-2xl flex items-center gap-4 max-w-lg">
                <AlertTriangle size={24} />
                <div>
                  <h3 className="font-bold text-danger">{t('common.error')}</h3>
                  <p className="text-sm text-danger-muted">{error}</p>
                </div>
              </motion.div>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -16, scale: 0.98 }}
              transition={transition}
              className="absolute inset-0 overflow-y-auto custom-scrollbar"
            >
              <div className="flex flex-col items-center justify-start min-h-full px-4 py-12">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  className="text-center mb-10"
                >
                  <div className="w-16 h-16 bg-brand-surface rounded-2xl flex items-center justify-center border border-brand-border mx-auto mb-5">
                    <Tag className="text-brand" size={28} />
                  </div>
                  <h1 className="text-3xl font-bold text-text-primary mb-3">{t('namespace.title')}</h1>
                  <p className="text-sm text-text-secondary max-w-md mx-auto leading-relaxed">{t('namespace.description')}</p>
                </motion.div>

                {/* Stats summary */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full max-w-3xl mb-10">
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.05 }}
                    className="bg-surface-primary rounded-2xl p-5 border border-border-primary text-center"
                  >
                    <div className="text-text-secondary text-xs uppercase font-bold tracking-wider mb-2">{t('namespace.total')}</div>
                    <div className="text-4xl font-mono tracking-tight text-brand">{namespaces.length}</div>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.1 }}
                    className="bg-surface-primary rounded-2xl p-5 border border-border-primary text-center"
                  >
                    <div className="text-text-secondary text-xs uppercase font-bold tracking-wider mb-2">{t('namespace.totalPaths')}</div>
                    <div className="text-4xl font-mono tracking-tight text-text-primary">{namespaces.reduce((a, n) => a + n.path_count, 0)}</div>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.15 }}
                    className="bg-surface-primary rounded-2xl p-5 border border-border-primary text-center"
                  >
                    <div className="text-text-secondary text-xs uppercase font-bold tracking-wider mb-2">{t('namespace.totalNodes')}</div>
                    <div className="text-4xl font-mono tracking-tight text-text-primary">{namespaces.reduce((a, n) => a + n.node_count, 0)}</div>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                    className="bg-surface-primary rounded-2xl p-5 border border-border-primary text-center"
                  >
                    <div className="text-text-secondary text-xs uppercase font-bold tracking-wider mb-2">{t('namespace.totalMemories')}</div>
                    <div className="text-4xl font-mono tracking-tight text-text-primary">{namespaces.reduce((a, n) => a + n.memory_count, 0)}</div>
                  </motion.div>
                </div>

                {/* Namespace table */}
                <div className="w-full max-w-4xl">
                  {namespaces.length === 0 && !loading ? (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-16 text-text-muted gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-surface-secondary flex items-center justify-center">
                        <Tag size={28} className="opacity-40" />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-light text-text-tertiary">{t('namespace.empty')}</p>
                      </div>
                    </motion.div>
                  ) : (
                    <div className="bg-surface-primary border border-border-primary rounded-2xl overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border-primary bg-surface-secondary/50">
                              <th className="text-left px-4 py-3 text-xs font-bold text-text-secondary uppercase tracking-wider">{t('namespace.name')}</th>
                              <th className="text-right px-4 py-3 text-xs font-bold text-text-secondary uppercase tracking-wider">{t('namespace.code')}</th>
                              <th className="text-right px-4 py-3 text-xs font-bold text-text-secondary uppercase tracking-wider">{t('namespace.concept')}</th>
                              <th className="text-right px-4 py-3 text-xs font-bold text-text-secondary uppercase tracking-wider">{t('namespace.memoryDomain')}</th>
                              <th className="text-right px-4 py-3 text-xs font-bold text-text-secondary uppercase tracking-wider">
                                <span className="inline-flex items-center gap-1"><BookOpen size={12} />{t('namespace.glossary')}</span>
                              </th>
                              <th className="text-right px-4 py-3 text-xs font-bold text-text-secondary uppercase tracking-wider">
                                <span className="inline-flex items-center gap-1"><Link2 size={12} />{t('namespace.links')}</span>
                              </th>
                              <th className="text-right px-4 py-3 text-xs font-bold text-text-secondary uppercase tracking-wider">{t('common.actions')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {namespaces.map((ns, idx) => {
                              const isActive = ns.name === currentNs;
                              const isDefault = ns.name === '';
                              const InitializingCell = () => (
                                <span className="group relative inline-flex items-center justify-center">
                                  <Loader2 size={14} className="animate-spin text-text-muted" />
                                  <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap rounded-md bg-surface-primary border border-border-primary px-2 py-1 text-[10px] text-text-secondary opacity-0 transition-opacity group-hover:opacity-100 shadow-sm z-10">
                                    {t('namespace.initializing')}
                                  </span>
                                </span>
                              );
                              return (
                                <motion.tr
                                  key={ns.name}
                                  initial={{ opacity: 0, y: 10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ duration: 0.3, delay: idx * 0.03 }}
                                  className={clsx(
                                    "row-divider last:border-b-0 transition-colors",
                                    isActive ? "bg-brand-surface/30" : "hover:bg-surface-secondary/30"
                                  )}
                                >
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                      <Tag size={14} className={isActive ? "text-brand" : "text-text-muted"} />
                                      <span className={clsx("font-medium", isActive ? "text-brand" : "text-text-primary")}>
                                        {isDefault ? t('app.namespace.default') : ns.name}
                                      </span>
                                      {isActive && (
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-brand bg-brand-surface border border-brand-border px-1.5 py-0.5 rounded-md">
                                          {t('namespace.active')}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-right text-text-secondary font-mono">
                                    {ns.initializing ? <InitializingCell /> : (
                                      <span
                                        onMouseEnter={(e) => {
                                          const rect = e.currentTarget.getBoundingClientRect();
                                          showPopover({ left: rect.left + rect.width / 2, top: rect.bottom + 8, ns, domain: 'code' });
                                        }}
                                        onMouseLeave={hidePopover}
                                        className="cursor-pointer border-b border-dashed border-text-secondary/60 hover:border-text-primary hover:text-text-primary transition-colors select-none"
                                      >
                                        {ns.code.paths}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-right text-text-secondary font-mono">
                                    {ns.initializing ? <InitializingCell /> : (
                                      <span
                                        onMouseEnter={(e) => {
                                          const rect = e.currentTarget.getBoundingClientRect();
                                          showPopover({ left: rect.left + rect.width / 2, top: rect.bottom + 8, ns, domain: 'concept' });
                                        }}
                                        onMouseLeave={hidePopover}
                                        className="cursor-pointer border-b border-dashed border-text-secondary/60 hover:border-text-primary hover:text-text-primary transition-colors select-none"
                                      >
                                        {ns.concept.paths}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-right text-text-secondary font-mono">
                                    {ns.initializing ? <InitializingCell /> : (
                                      <span
                                        onMouseEnter={(e) => {
                                          const rect = e.currentTarget.getBoundingClientRect();
                                          showPopover({ left: rect.left + rect.width / 2, top: rect.bottom + 8, ns, domain: 'memory' });
                                        }}
                                        onMouseLeave={hidePopover}
                                        className="cursor-pointer border-b border-dashed border-text-secondary/60 hover:border-text-primary hover:text-text-primary transition-colors select-none"
                                      >
                                        {ns.memory.paths}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-right text-text-secondary font-mono">
                                    {ns.initializing ? <InitializingCell /> : ns.glossary_count}
                                  </td>
                                  <td className="px-4 py-3 text-right text-text-secondary font-mono">
                                    {ns.initializing ? <InitializingCell /> : ns.code_link_count}
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      <button
                                        onClick={() => switchToNamespace(ns.name)}
                                        title={t('namespace.switch')}
                                        className="p-1.5 rounded-lg text-text-tertiary hover:text-brand hover:bg-brand-surface transition-all"
                                      >
                                        <ArrowRightLeft size={14} />
                                      </button>
                                      <button
                                        onClick={() => setRenameModal({ visible: true, ns })}
                                        title={t('namespace.rename')}
                                        className="p-1.5 rounded-lg text-text-tertiary hover:text-warning hover:bg-warning-surface transition-all"
                                      >
                                        <Pencil size={14} />
                                      </button>
                                      <button
                                        onClick={() => setConfirmModal({ visible: true, ns })}
                                        title={t('namespace.delete')}
                                        className="p-1.5 rounded-lg text-text-tertiary hover:text-danger hover:bg-danger-surface transition-all"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                  </td>
                                </motion.tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </main>

      {/* Detail Popover */}
      <AnimatePresence>
        {popoverPos && (
          <motion.div
            ref={popoverRef}
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            onMouseEnter={() => showPopover(popoverPos)}
            onMouseLeave={hidePopover}
            style={{
              position: 'fixed',
              left: popoverPos.left,
              top: popoverPos.top,
              transform: 'translateX(-50%)',
            }}
            className="z-50"
          >
            <div className="bg-surface-primary border border-border-primary rounded-xl shadow-xl p-4 min-w-[180px]">
              <div className="text-xs font-semibold text-text-primary mb-3 pb-2 border-b border-border-primary capitalize">
                {popoverPos.domain} — {popoverPos.ns.name || t('app.namespace.default')}
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between gap-6">
                  <span className="text-text-secondary">{t('namespace.paths')}</span>
                  <span className="font-mono text-text-primary">{popoverPos.ns[popoverPos.domain].paths}</span>
                </div>
                <div className="flex justify-between gap-6">
                  <span className="text-text-secondary">{t('namespace.nodes')}</span>
                  <span className="font-mono text-text-primary">{popoverPos.ns[popoverPos.domain].nodes}</span>
                </div>
                <div className="flex justify-between gap-6">
                  <span className="text-text-secondary">{t('namespace.memories')}</span>
                  <span className="font-mono text-text-primary">{popoverPos.ns[popoverPos.domain].memories}</span>
                </div>
                <div className="flex justify-between gap-6">
                  <span className="text-text-secondary">{t('namespace.glossary')}</span>
                  <span className="font-mono text-text-primary">{popoverPos.ns.glossary_count}</span>
                </div>
                <div className="flex justify-between gap-6">
                  <span className="text-text-secondary">{t('namespace.links')}</span>
                  <span className="font-mono text-text-primary">{popoverPos.ns.code_link_count}</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
