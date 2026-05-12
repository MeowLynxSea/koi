import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVirtualizer } from '@tanstack/react-virtual';
import clsx from 'clsx';
import {
  Trash2, Sparkles, AlertTriangle, RefreshCw,
  Archive, Unlink, CheckSquare, Square, Minus, ArrowLeft
} from 'lucide-react';
import { api } from '../../lib/api';
import { useTranslation } from '../../i18n';
import OrphanCard from './OrphanCard';
import DeleteProgressModal from './DeleteProgressModal';

function SectionHeader({ icon, label, color, items, selectedIds, onToggleAll }) {
  const allSelected = items.length > 0 && items.every(i => selectedIds.has(i.id));
  const someSelected = items.some(i => selectedIds.has(i.id));
  return (
    <div className="flex items-center gap-3 mb-5">
      <button onClick={() => onToggleAll(items)} className="p-1 rounded-lg transition-colors hover:bg-surface-secondary">
        {allSelected ? <CheckSquare size={16} className={color} /> : someSelected ? <Minus size={16} className={color} /> : <Square size={16} className="text-text-muted" />}
      </button>
      {icon}
      <h3 className={`text-xs font-bold uppercase tracking-widest ${color}`}>{label}</h3>
      <span className="text-[11px] text-text-muted bg-surface-secondary px-2.5 py-1 rounded-full border border-border-primary">{items.length}</span>
    </div>
  );
}

function StatCard({ title, count, desc, colorClass, borderHoverClass, onClick, delay }) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={clsx(
        "bg-surface-primary rounded-2xl p-6 border border-border-primary text-left card-hover transition-colors",
        borderHoverClass
      )}
    >
      <div className="text-text-secondary text-xs uppercase font-bold tracking-wider mb-2">{title}</div>
      <div className={clsx("text-5xl font-mono tracking-tight", colorClass)}>{count}</div>
      <div className="text-text-muted text-[11px] mt-2">{desc}</div>
    </motion.button>
  );
}

function StatSkeleton() {
  return <div className="h-36 rounded-2xl animate-shimmer" />;
}

function MaintenanceListView({
  items,
  activeCategory,
  selectedIds,
  onToggleAll,
  onToggle,
  onExpand,
  expandedId,
  detailData,
  detailLoading,
  onBack,
  t,
}) {
  const parentRef = useRef(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 150,
    getItemKey: (index) => items[index].id,
    measureElement: (el) => el.getBoundingClientRect().height,
    overscan: 5,
  });

  return (
    <motion.div
      key="list"
      initial={{ opacity: 0, x: 24, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 24, scale: 0.98 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="absolute inset-0 flex flex-col"
    >
      <div className="px-4 sm:px-6 lg:px-8 pt-5 pb-2 flex-shrink-0">
        <button
          onClick={onBack}
          className="group flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors rounded-xl px-3 py-2 -ml-3 hover:bg-surface-secondary"
        >
          <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-0.5" />
          {t('common.back')}
        </button>
      </div>
      <div ref={parentRef} className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 custom-scrollbar">
        <div className="max-w-4xl mx-auto pb-8">
          <SectionHeader
            icon={activeCategory === 'deprecated'
              ? <Archive size={16} className="text-warning" />
              : <Unlink size={16} className="text-danger" />
            }
            label={activeCategory === 'deprecated'
              ? t('maintenance.deprecatedVersions')
              : t('maintenance.orphanedMemories')
            }
            color={activeCategory === 'deprecated' ? 'text-warning' : 'text-danger'}
            items={items}
            selectedIds={selectedIds}
            onToggleAll={onToggleAll}
          />
          {items.length > 0 ? (
            <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const item = items[virtualItem.index];
                return (
                  <div
                    key={virtualItem.key}
                    ref={virtualizer.measureElement}
                    data-index={virtualItem.index}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                  >
                    <div className="mb-3">
                      <OrphanCard
                        item={item}
                        isExpanded={expandedId === item.id}
                        detail={detailData[item.id]}
                        isLoadingDetail={detailLoading === item.id}
                        isChecked={selectedIds.has(item.id)}
                        onToggle={onToggle}
                        onExpand={onExpand}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-16 text-text-muted gap-4">
              <div className="w-14 h-14 rounded-2xl bg-surface-secondary flex items-center justify-center">
                <Sparkles size={28} className="opacity-40" />
              </div>
              <div className="text-center">
                <p className="text-sm font-light text-text-tertiary">{t('maintenance.systemClean')}</p>
                <p className="text-xs uppercase tracking-widest text-text-muted mt-1">{t('maintenance.noOrphans')}</p>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default function MaintenancePage() {
  const { t } = useTranslation();
  const [orphans, setOrphans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [view, setView] = useState('stats'); // 'stats' | 'list'
  const [activeCategory, setActiveCategory] = useState(null); // 'deprecated' | 'orphaned'

  const [expandedId, setExpandedId] = useState(null);
  const [detailData, setDetailData] = useState({});
  const [detailLoading, setDetailLoading] = useState(null);

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [deleteModal, setDeleteModal] = useState({
    visible: false,
    phase: 'confirm',
    logs: [],
    total: 0,
  });

  useEffect(() => { loadOrphans(); }, []);

  const loadOrphans = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelectedIds(new Set());
    try {
      const res = await api.get('/maintenance/orphans');
      setOrphans(res.data);
    } catch (err) {
      setError(t('maintenance.error') + ': ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const toggleSelect = useCallback((id, e) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback((items) => {
    const ids = items.map(i => i.id);
    setSelectedIds(prev => {
      const next = new Set(prev);
      const allSelected = ids.every(id => next.has(id));
      if (allSelected) ids.forEach(id => next.delete(id));
      else ids.forEach(id => next.add(id));
      return next;
    });
  }, []);

  const openDeleteConfirm = useCallback(() => {
    const count = selectedIds.size;
    if (count === 0) return;
    setDeleteModal({ visible: true, phase: 'confirm', logs: [], total: count });
  }, [selectedIds]);

  const executeDelete = useCallback(async () => {
    const toDelete = [...selectedIds];
    const count = toDelete.length;
    if (count === 0) return;

    setDeleteModal({ visible: true, phase: 'deleting', logs: [], total: count });
    setBatchDeleting(true);

    const logs = [];
    const successfullyRemoved = new Set();
    const failedIds = new Set();

    for (let i = 0; i < toDelete.length; i++) {
      const id = toDelete[i];
      let status = 'success';
      try {
        await api.delete(`/maintenance/orphans/${id}`);
        successfullyRemoved.add(id);
      } catch (err) {
        if (err.response?.status === 404) {
          status = 'success';
          successfullyRemoved.add(id);
        } else {
          status = 'error';
          failedIds.add(id);
        }
      }
      logs.push({ id, status });
      setDeleteModal(prev => ({ ...prev, logs: [...logs] }));
    }

    setOrphans(prev => prev.filter(item => !successfullyRemoved.has(item.id)));
    setSelectedIds(failedIds);
    if (expandedId && toDelete.includes(expandedId) && !failedIds.has(expandedId)) setExpandedId(null);

    setDeleteModal(prev => ({ ...prev, phase: 'done' }));
    setBatchDeleting(false);
  }, [selectedIds, expandedId]);

  const closeDeleteModal = useCallback(() => {
    setDeleteModal(prev => ({ ...prev, visible: false }));
  }, []);

  const handleExpand = useCallback((id) => {
    setExpandedId(prev => prev === id ? null : id);
  }, []);

  useEffect(() => {
    if (!expandedId) return;
    if (detailData[expandedId]) return;

    let cancelled = false;
    setDetailLoading(expandedId);
    api.get(`/maintenance/orphans/${expandedId}`)
      .then(res => {
        if (!cancelled) setDetailData(prev => ({ ...prev, [expandedId]: res.data }));
      })
      .catch(err => {
        if (!cancelled) setDetailData(prev => ({
          ...prev,
          [expandedId]: { error: err.response?.data?.detail || err.message }
        }));
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(null);
      });

    return () => { cancelled = true; };
  }, [expandedId]);

  const deprecated = useMemo(() => orphans.filter(o => o.category === 'deprecated'), [orphans]);
  const orphaned = useMemo(() => orphans.filter(o => o.category === 'orphaned'), [orphans]);

  const activeItems = useMemo(() => {
    if (activeCategory === 'deprecated') return deprecated;
    if (activeCategory === 'orphaned') return orphaned;
    return [];
  }, [activeCategory, deprecated, orphaned]);

  const handleCardClick = useCallback((category) => {
    setActiveCategory(category);
    setView('list');
  }, []);

  const handleBack = useCallback(() => {
    setView('stats');
    setActiveCategory(null);
    setExpandedId(null);
  }, []);

  const transition = { duration: 0.35, ease: [0.16, 1, 0.3, 1] };

  return (
    <div className="flex h-full bg-bg-primary text-text-primary overflow-hidden relative">
      <DeleteProgressModal
        visible={deleteModal.visible}
        phase={deleteModal.phase}
        logs={deleteModal.logs}
        total={deleteModal.total}
        onConfirm={executeDelete}
        onClose={closeDeleteModal}
      />

      <main className="flex-1 flex flex-col min-w-0 bg-bg-primary relative overflow-hidden">
        {/* Content */}
        <div className="flex-1 relative overflow-hidden">
          {/* Floating action buttons */}
          <div className="absolute top-4 right-4 sm:top-6 sm:right-6 lg:top-8 lg:right-8 z-20 flex items-center gap-2">
            {view === 'list' && selectedIds.size > 0 && (
              <motion.button initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} onClick={openDeleteConfirm} disabled={batchDeleting}
                className="flex items-center gap-1.5 px-3 sm:px-4 py-2 text-xs font-semibold rounded-xl bg-danger-surface text-danger hover:bg-danger-surface border border-danger-border transition-all disabled:opacity-50 btn-press"
              >
                {batchDeleting ? <div className="w-3 h-3 border-2 border-danger-muted border-t-danger rounded-full animate-spin"></div> : <Trash2 size={13} />}
                <span className="hidden sm:inline">{t('maintenance.deleteSelected', { count: selectedIds.size })}</span>
              </motion.button>
            )}
            <motion.button whileTap={{ scale: 0.95 }} onClick={loadOrphans} className="p-2.5 text-text-tertiary hover:text-brand hover:bg-surface-secondary rounded-xl transition-all" title={t('maintenance.refresh')}>
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </motion.button>
          </div>
          {error ? (
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-danger bg-danger-surface border border-danger-border p-6 rounded-2xl flex items-center gap-4 max-w-lg">
                <AlertTriangle size={24} />
                <div>
                  <h3 className="font-bold text-danger">{t('maintenance.error')}</h3>
                  <p className="text-sm text-danger-muted">{error}</p>
                </div>
              </motion.div>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              {view === 'stats' ? (
                <motion.div
                  key="stats"
                  initial={{ opacity: 0, y: 16, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -16, scale: 0.98 }}
                  transition={transition}
                  className="absolute inset-0 overflow-y-auto"
                >
                  <div className="flex flex-col items-center justify-center min-h-full px-4 py-12">
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                      className="text-center mb-10"
                    >
                      <div className="w-16 h-16 bg-warning-surface rounded-2xl flex items-center justify-center border border-warning-border mx-auto mb-5">
                        <Sparkles className="text-warning" size={28} />
                      </div>
                      <h1 className="text-3xl font-bold text-text-primary mb-3">{t('maintenance.title')}</h1>
                      <p className="text-sm text-text-secondary max-w-md mx-auto leading-relaxed">{t('maintenance.description')}</p>
                    </motion.div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-lg">
                      {loading ? (
                        <>
                          <StatSkeleton />
                          <StatSkeleton />
                        </>
                      ) : (
                        <>
                          <StatCard
                            title={t('maintenance.deprecated')}
                            count={deprecated.length}
                            desc={t('maintenance.deprecatedDesc')}
                            colorClass="text-warning"
                            borderHoverClass="hover:border-warning-border"
                            onClick={() => handleCardClick('deprecated')}
                            delay={0.05}
                          />
                          <StatCard
                            title={t('maintenance.orphaned')}
                            count={orphaned.length}
                            desc={t('maintenance.orphanedDesc')}
                            colorClass="text-danger"
                            borderHoverClass="hover:border-danger-border"
                            onClick={() => handleCardClick('orphaned')}
                            delay={0.15}
                          />
                        </>
                      )}
                    </div>

                  </div>
                </motion.div>
              ) : (
                <MaintenanceListView
                  items={activeItems}
                  activeCategory={activeCategory}
                  selectedIds={selectedIds}
                  onToggleAll={toggleSelectAll}
                  onToggle={toggleSelect}
                  onExpand={handleExpand}
                  expandedId={expandedId}
                  detailData={detailData}
                  detailLoading={detailLoading}
                  onBack={handleBack}
                  t={t}
                />
              )}
            </AnimatePresence>
          )}
        </div>
      </main>
    </div>
  );
}
