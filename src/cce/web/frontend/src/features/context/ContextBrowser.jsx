import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { Folder, Edit3, Save, X, Hash, AlertTriangle, Link2, Star, Code, Menu } from 'lucide-react';
import clsx from 'clsx';
import { api } from '../../lib/api';
import { useTranslation } from '../../i18n';
import PriorityBadge from './components/PriorityBadge';
import GlossaryHighlighter from './components/GlossaryHighlighter';
import KeywordManager from './components/KeywordManager';
import DomainNode from './components/ContextSidebar';
import Breadcrumb from './components/Breadcrumb';
import NodeGridCard from './components/NodeGridCard';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.04 } }
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } }
};

export default function ContextBrowser() {
  const { t } = useTranslation();
  const params = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const splat = (params['*'] || '').replace(/^\/+/, '').replace(/\/+$/, '');
  let domain, path;

  if (splat) {
    const slashIdx = splat.indexOf('/');
    if (slashIdx === -1) { domain = decodeURIComponent(splat); path = ''; }
    else { domain = decodeURIComponent(splat.slice(0, slashIdx)); path = splat.slice(slashIdx + 1).split('/').map(decodeURIComponent).join('/'); }
  } else {
    domain = searchParams.get('domain') || 'code';
    path = searchParams.get('path') || '';
  }

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState({ node: null, children: [], breadcrumbs: [] });
  const [domains, setDomains] = useState([]);

  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editDisclosure, setEditDisclosure] = useState('');
  const [editPriority, setEditPriority] = useState(0);
  const [saving, setSaving] = useState(false);

  const currentRouteRef = useRef({ domain, path });
  useEffect(() => { currentRouteRef.current = { domain, path }; }, [domain, path]);

  useEffect(() => {
    api.get('/browse/domains').then(res => setDomains(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      setEditing(false);
      try {
        const res = await api.get('/browse/node', { params: { domain, path } });
        setData(res.data);
        setEditContent(res.data.node?.content || '');
        setEditDisclosure(res.data.node?.disclosure || '');
        setEditPriority(res.data.node?.priority ?? 0);
      } catch (err) {
        setError(err.response?.data?.detail || err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [domain, path]);

  const navigateTo = (newPath, newDomain) => {
    const targetDomain = newDomain || domain;
    let targetUrl;
    if (!newPath) targetUrl = `/context/${encodeURIComponent(targetDomain)}`;
    else {
      const segments = newPath.split('/').map(encodeURIComponent).join('/');
      targetUrl = `/context/${encodeURIComponent(targetDomain)}/${segments}`;
    }
    if (targetUrl !== location.pathname) navigate(targetUrl);
  };

  const refreshData = () => {
    return api.get('/browse/node', { params: { domain, path } })
      .then(res => {
        setData(currentData => {
          if (currentRouteRef.current.domain === domain && currentRouteRef.current.path === path) return res.data;
          return currentData;
        });
      });
  };

  const startEditing = () => {
    setEditContent(data.node?.content || '');
    setEditDisclosure(data.node?.disclosure || '');
    setEditPriority(data.node?.priority ?? 0);
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setEditContent(data.node?.content || '');
    setEditDisclosure(data.node?.disclosure || '');
    setEditPriority(data.node?.priority ?? 0);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {};
      if (editContent !== (data.node?.content || '')) payload.content = editContent;
      if (editPriority !== (data.node?.priority ?? 0)) payload.priority = editPriority;
      if (editDisclosure !== (data.node?.disclosure || '')) payload.disclosure = editDisclosure;
      if (Object.keys(payload).length === 0) { setEditing(false); return; }
      await api.put('/browse/node', payload, { params: { domain, path } });
      await refreshData();
      setEditing(false);
    } catch (err) {
      alert(t('context.saveFailed', { msg: err.message }));
    } finally {
      setSaving(false);
    }
  };

  const isRoot = !path;
  const node = data.node;

  return (
    <div className="flex h-full bg-bg-primary text-text-secondary overflow-hidden relative">
      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={clsx(
        "absolute lg:static inset-y-0 left-0 z-50 w-64 lg:w-72 flex-shrink-0 bg-surface-primary border-r border-border-primary flex flex-col transition-transform duration-300 ease-out-expo",
        sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="flex items-center justify-between p-4 lg:hidden border-b border-border-primary">
          <span className="text-sm font-semibold text-text-primary">{t('context.title')}</span>
          <button onClick={() => setSidebarOpen(false)} className="p-2 rounded-xl hover:bg-surface-secondary text-text-muted">
            <X size={18} />
          </button>
        </div>

        <div className="p-3 lg:p-4 flex-1 overflow-y-auto custom-scrollbar pt-2 lg:pt-4">
          <div className="mb-4">
            <h3 className="px-2 lg:px-3 text-[10px] font-bold text-text-muted uppercase tracking-widest mb-3">{t('context.domains')}</h3>
            {domains.map(d => <DomainNode key={d.domain} domain={d.domain} rootCount={d.root_count} activeDomain={domain} activePath={path} onNavigate={navigateTo} />)}
            {domains.length === 0 && <DomainNode domain="code" activeDomain={domain} activePath={path} onNavigate={navigateTo} />}
          </div>
        </div>

        <div className="mt-auto p-4 lg:p-5 border-t border-border-primary">
          <div className="bg-surface-secondary rounded-xl p-4 border border-border-primary">
            <div className="flex items-center gap-2 text-xs text-text-muted mb-2">
              <Hash size={12} />
              <span>{t('context.currentPath')}</span>
            </div>
            <code className="block text-[11px] font-mono text-brand-muted break-all leading-tight">{domain}://{path || t('context.root')}</code>
          </div>
        </div>
      </aside>

      {/* Main Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-bg-primary relative overflow-y-auto custom-scrollbar">
        <div className="sticky top-0 z-10 bg-bg-primary/80 backdrop-blur-xl border-b border-border-primary px-4 sm:px-6 lg:px-8 py-3 lg:py-4">
          <div className="flex items-center gap-2">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-xl hover:bg-surface-secondary text-text-muted flex-shrink-0">
              <Menu size={18} />
            </button>
            <Breadcrumb items={data.breadcrumbs} onNavigate={navigateTo} />
          </div>
        </div>

        <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
          {loading ? (
            <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-3 flex-1">
                  <div className="w-48 h-8 rounded-xl animate-shimmer" />
                  <div className="w-64 h-4 rounded animate-shimmer" />
                </div>
                <div className="w-24 h-10 rounded-xl animate-shimmer" />
              </div>
              <div className="h-64 rounded-2xl animate-shimmer" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-40 rounded-2xl animate-shimmer" />)}
              </div>
            </div>
          ) : error ? (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="h-full flex flex-col items-center justify-center text-danger gap-4 py-20">
              <p className="text-lg font-semibold">{t('context.accessDenied')}</p>
              <p className="text-sm opacity-70">{error}</p>
              <button onClick={() => navigateTo('')} className="text-xs bg-surface-secondary px-5 py-2.5 rounded-xl hover:bg-surface-tertiary transition-all border border-border-primary">{t('context.returnToRoot')}</button>
            </motion.div>
          ) : (
            <motion.div variants={containerVariants} initial="hidden" animate="visible" className="max-w-6xl mx-auto space-y-8">

              {node && (!isRoot || !node.is_virtual || editing) && (
                <div className="space-y-5">
                  <motion.div variants={itemVariants} className="flex flex-col sm:flex-row items-start justify-between gap-4">
                    <div className="space-y-3 min-w-0 flex-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h1 className="text-xl sm:text-2xl font-bold text-text-primary tracking-tight">{node.name || path.split('/').pop()}</h1>
                        <PriorityBadge priority={node.priority} size="lg" />
                      </div>

                      {node.disclosure && !editing && (
                        <div className="inline-flex items-center gap-2 px-4 py-2 bg-warning-surface border border-warning-border rounded-xl text-warning text-xs max-w-full">
                          <AlertTriangle size={14} className="flex-shrink-0" />
                          <span className="font-medium mr-1">{t('context.disclosureLabel')}</span>
                          <span className="font-mono truncate">{node.disclosure}</span>
                        </div>
                      )}

                      {node.aliases && node.aliases.length > 0 && !editing && (
                        <div className="flex items-start gap-2 text-xs text-text-muted">
                          <Link2 size={13} className="flex-shrink-0 mt-0.5" />
                          <div className="flex flex-wrap gap-1.5">
                            <span className="text-text-muted font-medium">{t('context.alsoReachableVia')}</span>
                            {node.aliases.map(alias => <code key={alias} className="px-2 py-0.5 bg-surface-secondary rounded-lg text-brand-muted font-mono text-[11px] border border-border-primary">{alias}</code>)}
                          </div>
                        </div>
                      )}

                      {!editing && !node.is_virtual && <KeywordManager keywords={node.glossary_keywords || []} nodeUuid={node.node_uuid} onUpdate={refreshData} />}
                    </div>

                    <div className="flex gap-2 flex-shrink-0">
                      {editing ? (
                        <>
                          <motion.button whileTap={{ scale: 0.95 }} onClick={cancelEditing} className="p-2.5 hover:bg-surface-secondary rounded-xl text-text-tertiary transition-all">
                            <X size={18} />
                          </motion.button>
                          <motion.button whileTap={{ scale: 0.95 }} onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-brand hover:bg-brand-hover text-text-inverse rounded-xl text-sm font-semibold transition-all btn-press">
                            <Save size={16} /> {saving ? t('context.saving') : t('context.saveChanges')}
                          </motion.button>
                        </>
                      ) : (
                        <motion.button whileTap={{ scale: 0.95 }} onClick={startEditing} className="flex items-center gap-2 px-5 py-2.5 bg-surface-secondary hover:bg-surface-tertiary text-text-secondary rounded-xl text-sm font-medium transition-all border border-border-primary hover:border-border-secondary">
                          <Edit3 size={16} /> {t('context.edit')}
                        </motion.button>
                      )}
                    </div>
                  </motion.div>

                  <AnimatePresence>
                    {editing && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 sm:p-5 bg-surface-secondary border border-border-primary rounded-2xl">
                          <div className="space-y-2">
                            <label className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                              <Star size={12} /> {t('context.priority')} <span className="text-text-muted font-normal">{t('context.priorityHint')}</span>
                            </label>
                            <input type="number" min="0" value={editPriority} onChange={e => setEditPriority(parseInt(e.target.value) || 0)} className="w-full bg-bg-primary border border-border-primary rounded-xl px-4 py-2.5 text-sm text-text-primary font-mono focus:outline-none focus:border-brand transition-all" />
                          </div>
                          <div className="space-y-2">
                            <label className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                              <AlertTriangle size={12} /> {t('context.disclosure')} <span className="text-text-muted font-normal">{t('context.disclosureHint')}</span>
                            </label>
                            <input type="text" value={editDisclosure} onChange={e => setEditDisclosure(e.target.value)} placeholder="e.g. When working on authentication..." className="w-full bg-bg-primary border border-border-primary rounded-xl px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-brand transition-all" />
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <motion.div variants={itemVariants} className={clsx("relative rounded-2xl border overflow-hidden transition-all duration-300", editing ? "bg-bg-primary border-brand shadow-sm" : "bg-surface-primary border-border-primary")}>
                    {editing ? (
                      <textarea value={editContent} onChange={e => setEditContent(e.target.value)} className="w-full h-96 p-6 md:p-8 bg-transparent text-text-primary font-mono text-sm leading-relaxed focus:outline-none resize-y" spellCheck={false} />
                    ) : (
                      <div className="p-6 md:p-8 font-mono text-sm leading-relaxed text-text-secondary">
                        <GlossaryHighlighter key={node.node_uuid} content={node.content || ''} glossary={node.glossary_matches || []} currentNodeUuid={node.node_uuid} onNavigate={navigateTo} />
                      </div>
                    )}
                  </motion.div>

                  {!editing && node.linked_code_nodes && node.linked_code_nodes.length > 0 && (
                    <motion.div variants={itemVariants} className="space-y-3">
                      <div className="flex items-center gap-2 text-xs text-text-muted">
                        <Code size={13} className="text-success" />
                        <span className="font-medium text-text-secondary">{t('context.linkedCode')}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {node.linked_code_nodes.map(linked => (
                          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} key={linked.uri} onClick={() => navigateTo(linked.path, linked.domain)} className="flex items-center gap-1.5 px-4 py-2 bg-success-surface border border-success-border rounded-xl text-success text-xs font-mono hover:bg-success-surface hover:border-success transition-all">
                            <Code size={12} /> {linked.path}
                          </motion.button>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {!editing && node.linked_memory_nodes && node.linked_memory_nodes.length > 0 && (
                    <motion.div variants={itemVariants} className="space-y-3">
                      <div className="flex items-center gap-2 text-xs text-text-muted">
                        <Link2 size={13} className="text-brand" />
                        <span className="font-medium text-text-secondary">{t('context.linkedBy')}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {node.linked_memory_nodes.map(linked => (
                          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} key={linked.uri} onClick={() => navigateTo(linked.path, linked.domain)} className="flex items-center gap-1.5 px-4 py-2 bg-brand-surface border border-brand-border rounded-xl text-brand text-xs font-mono hover:bg-brand-surface hover:border-brand transition-all">
                            <Link2 size={12} /> {linked.domain}://{linked.path}
                          </motion.button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </div>
              )}

              {data.children && data.children.length > 0 && (
                <motion.div variants={itemVariants} className="space-y-5 pt-4">
                  <div className="flex items-center gap-3 text-text-muted">
                    <h2 className="text-xs font-bold uppercase tracking-widest">{isRoot ? t('context.contextClusters') : t('context.subContexts')}</h2>
                    <div className="h-px flex-1 bg-border-primary"></div>
                    <span className="text-xs bg-surface-secondary px-3 py-1 rounded-full border border-border-primary">{data.children.length}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {data.children.map((child, i) => (
                      <motion.div key={`${child.domain || domain}:${child.path}`} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>
                        <NodeGridCard node={child} currentDomain={domain} onClick={() => navigateTo(child.path, child.domain)} />
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}

              {!loading && !data.children?.length && !node && (
                <motion.div variants={itemVariants} className="flex flex-col items-center justify-center py-20 text-text-muted gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-surface-secondary flex items-center justify-center">
                    <Folder size={32} className="opacity-30" />
                  </div>
                  <p className="text-sm">{t('context.emptySector')}</p>
                </motion.div>
              )}
            </motion.div>
          )}
        </div>
      </main>
    </div>
  );
}
