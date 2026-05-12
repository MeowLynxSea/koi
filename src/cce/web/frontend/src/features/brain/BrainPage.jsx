import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Activity, Zap, GitBranch, Clock, BrainCircuit, Eye, Radio } from 'lucide-react';
import { getTopActivated, getDreamLog, getNodeNeighbors, getNodeActivation, getBrainStats, getWorkingMemory, getLastOperation } from '../../lib/api';
import { useTranslation } from '../../i18n';

function useNamespace() {
  const [namespace, setNamespace] = useState(null);

  useEffect(() => {
    fetch('/api/namespace')
      .then(r => r.json())
      .then(data => setNamespace(data.namespace || ''))
      .catch(() => setNamespace(''));
  }, []);

  return namespace;
}

function StatsPanel({ namespace }) {
  const { t } = useTranslation();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    getBrainStats()
      .then(data => setStats(data))
      .catch(() => setStats(null));
  }, [namespace]);

  if (!stats) return null;

  const items = [
    { label: t('brain.stats.totalEdges'), value: stats.total_edges },
    { label: t('brain.stats.totalEpisodes'), value: stats.total_episodes },
    { label: t('brain.stats.activeNodes'), value: stats.active_nodes },
    { label: t('brain.stats.avgActivation'), value: `${(stats.avg_activation * 100).toFixed(1)}%` },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      {items.map((item, i) => (
        <div key={i} className="px-4 py-3 rounded-xl bg-surface-secondary border border-border-primary">
          <div className="text-xs text-text-muted">{item.label}</div>
          <div className="text-lg font-semibold text-text-primary mt-1">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

function ActivationPanel({ namespace }) {
  const { t } = useTranslation();
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getTopActivated(20, 0.01)
      .then(data => setNodes(data.nodes || []))
      .catch(() => setNodes([]))
      .finally(() => setLoading(false));
  }, [namespace]);

  if (loading) return <div className="text-text-muted text-sm animate-pulse">{t('brain.loading')}</div>;

  return (
    <div className="space-y-2">
      {nodes.length === 0 && <div className="text-text-muted text-sm">{t('brain.noActiveNodes')}</div>}
      {nodes.map((node, i) => (
        <div
          key={node.node_uuid}
          className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-secondary border border-border-primary hover:border-brand transition-colors"
        >
          <div className="w-6 h-6 rounded-full bg-brand/10 text-brand flex items-center justify-center text-xs font-bold">
            {i + 1}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate text-text-primary">{node.uri || node.node_uuid}</div>
            <div className="text-xs text-text-muted">
              current: {(node.current_activation * 100).toFixed(1)}% · baseline: {(node.baseline_activation * 100).toFixed(1)}%
            </div>
          </div>
          <div className="w-24 h-1.5 bg-surface-primary rounded-full overflow-hidden">
            <div
              className="h-full bg-brand rounded-full transition-all"
              style={{ width: `${Math.max(2, node.current_activation * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function DreamLogPanel({ namespace }) {
  const { t } = useTranslation();
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getDreamLog(50)
      .then(data => setEpisodes(data.episodes || []))
      .catch(() => setEpisodes([]))
      .finally(() => setLoading(false));
  }, [namespace]);

  if (loading) return <div className="text-text-muted text-sm animate-pulse">{t('brain.loading')}</div>;

  return (
    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
      {episodes.length === 0 && <div className="text-text-muted text-sm">{t('brain.noEpisodes')}</div>}
      {episodes.map(ep => (
        <div key={ep.id} className="px-3 py-2 rounded-lg bg-surface-secondary border border-border-primary text-sm">
          <div className="flex items-center gap-2 text-text-primary">
            <Zap size={12} className="text-brand" />
            <span className="font-medium capitalize">{ep.episode_type}</span>
            <span className="text-text-muted text-xs ml-auto">{new Date(ep.created_at).toLocaleTimeString()}</span>
          </div>
          {ep.trigger_text && (
            <div className="text-xs text-text-muted mt-1 truncate">"{ep.trigger_text}"</div>
          )}
          <div className="text-xs text-text-muted mt-1">
            strength: {(ep.activation_strength * 100).toFixed(0)}%
          </div>
        </div>
      ))}
    </div>
  );
}

function NetworkExplorer() {
  const { t } = useTranslation();
  const [nodeUuid, setNodeUuid] = useState('');
  const [neighbors, setNeighbors] = useState([]);
  const [activation, setActivation] = useState(null);
  const [loading, setLoading] = useState(false);

  const explore = useCallback(async () => {
    if (!nodeUuid.trim()) return;
    setLoading(true);
    try {
      const [nbrs, act] = await Promise.all([
        getNodeNeighbors(nodeUuid.trim(), null, 0.1),
        getNodeActivation(nodeUuid.trim()).catch(() => null),
      ]);
      setNeighbors(nbrs.neighbors || []);
      setActivation(act);
    } catch {
      setNeighbors([]);
      setActivation(null);
    } finally {
      setLoading(false);
    }
  }, [nodeUuid]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={nodeUuid}
          onChange={e => setNodeUuid(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && explore()}
          placeholder="Enter node UUID..."
          className="flex-1 bg-surface-secondary border border-border-primary text-text-primary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand"
        />
        <button
          onClick={explore}
          disabled={loading}
          className="px-4 py-2 bg-brand hover:bg-brand-hover text-text-inverse rounded-lg text-sm font-medium transition-all disabled:opacity-50"
        >
          {t('common.confirm')}
        </button>
      </div>

      {activation && (
        <div className="px-3 py-2 rounded-lg bg-surface-secondary border border-border-primary text-sm">
          <div className="text-text-primary font-medium">{t('brain.activatedNodes')}</div>
          <div className="text-text-muted text-xs mt-1">
            Current: {(activation.current_activation * 100).toFixed(1)}% · Baseline: {(activation.baseline_activation * 100).toFixed(1)}%
          </div>
        </div>
      )}

      <div className="space-y-2">
        {neighbors.map(n => (
          <div key={n.edge_id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-secondary border border-border-primary text-sm">
            <GitBranch size={14} className="text-text-muted" />
            <div className="flex-1 min-w-0">
              <div className="text-text-primary truncate">{n.uri || n.node_uuid}</div>
              <div className="text-xs text-text-muted">{n.edge_type} · weight: {(n.weight * 100).toFixed(0)}%</div>
            </div>
          </div>
        ))}
        {neighbors.length === 0 && !loading && nodeUuid && (
          <div className="text-text-muted text-sm">{t('brain.noActiveNodes')}</div>
        )}
      </div>
    </div>
  );
}

function OperationPanel({ namespace }) {
  const { t } = useTranslation();
  const svgRef = useRef(null);
  const [operation, setOperation] = useState(null);
  const [wm, setWm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [opData, wmData] = await Promise.all([
        getLastOperation(),
        getWorkingMemory(),
      ]);
      setOperation(opData);
      setWm(wmData);
    } catch {
      setOperation(null);
      setWm(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchData();

    let es = null;
    let retryTimeout = null;

    const connect = () => {
      es = new EventSource('/api/brain/stream');
      es.addEventListener('connected', () => {
        setConnected(true);
      });
      es.addEventListener('process_utterance', () => {
        fetchData();
      });
      es.addEventListener('read_context', () => {
        fetchData();
      });
      es.addEventListener('search_context', () => {
        fetchData();
      });
      es.onerror = () => {
        setConnected(false);
        if (es) es.close();
        retryTimeout = setTimeout(connect, 3000);
      };
    };

    connect();
    return () => {
      if (es) es.close();
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, [fetchData, namespace]);

  if (loading) return <div className="text-text-muted text-sm animate-pulse">{t('brain.loading')}</div>;
  if (!operation || !operation.found) {
    return <div className="text-text-muted text-sm">{t('brain.noOperation')}</div>;
  }

  const op = operation.operation;
  const candidates = op.candidates || [];
  const wmNodeUuids = new Set((wm?.slots || []).map(s => s.node_uuid));
  const insertedUris = new Set(op.working_memory_changes?.inserted || []);
  const refreshedUris = new Set(op.working_memory_changes?.refreshed || []);

  // Build visual nodes
  const visualNodes = candidates.map((c, i) => {
    const isWm = wmNodeUuids.has(c.node_uuid);
    const isInserted = insertedUris.has(c.uri);
    const isRefreshed = refreshedUris.has(c.uri);
    return { ...c, index: i, isWm, isInserted, isRefreshed };
  });

  const width = 600;
  const height = 400;
  const cx = width / 2;
  const cy = height / 2;
  const centerR = 28;

  // Layout: query at center, candidates on concentric rings
  // Inner ring for WM nodes, outer ring for others
  const wmNodes = visualNodes.filter(n => n.isWm);
  const otherNodes = visualNodes.filter(n => !n.isWm);

  const placeNodes = (nodes, radiusBase, radiusVar) => {
    return nodes.map((n, i) => {
      const count = nodes.length;
      const angle = (2 * Math.PI * i) / count - Math.PI / 2;
      const r = radiusBase + radiusVar * (1 - n.score);
      return {
        ...n,
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
        r: 6 + n.score * 14,
      };
    });
  };

  const placedWm = placeNodes(wmNodes, 90, 30);
  const placedOther = placeNodes(otherNodes, 160, 40);
  const placedAll = [...placedWm, ...placedOther];

  return (
    <div className="space-y-4">
      <div className="px-3 py-2 rounded-lg bg-surface-secondary border border-border-primary text-sm flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-text-muted text-xs">{t('brain.query')}</div>
          <div className="text-text-primary font-medium mt-0.5 truncate">{op.query_text}</div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`relative flex h-2 w-2 ${connected ? 'text-green-500' : 'text-text-muted/40'}`}>
            {connected && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75" />}
            <span className={`relative inline-flex rounded-full h-2 w-2 ${connected ? 'bg-current' : 'bg-current'}`} />
          </span>
          <span className="text-[10px] text-text-muted">{connected ? 'LIVE' : 'OFF'}</span>
        </div>
      </div>

      <div className="relative w-full overflow-hidden rounded-xl border border-border-primary bg-surface-primary"
        style={{ aspectRatio: '3/2' }}>
        <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
          {/* Connecting lines from center */}
          {placedAll.map(n => (
            <line
              key={`line-${n.node_uuid}`}
              x1={cx} y1={cy}
              x2={n.x} y2={n.y}
              stroke="currentColor"
              strokeWidth={Math.max(0.5, n.score * 2)}
              className={n.isWm ? 'text-brand/30' : 'text-text-muted/20'}
            />
          ))}

          {/* Center node (Query) */}
          <circle cx={cx} cy={cy} r={centerR} className="fill-brand/10 stroke-brand" strokeWidth={2} />
          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" className="fill-brand text-[10px] font-bold">
            QUERY
          </text>

          {/* Candidate nodes */}
          {placedAll.map(n => {
            const opacity = 0.3 + n.score * 0.7;
            return (
              <g key={n.node_uuid}>
                <circle
                  cx={n.x} cy={n.y} r={n.r}
                  className={n.isWm ? 'fill-brand/80 stroke-brand' : 'fill-surface-secondary stroke-text-muted'}
                  strokeWidth={n.isWm ? 3 : 1}
                  opacity={opacity}
                />
                {n.isWm && (
                  <circle
                    cx={n.x} cy={n.y} r={n.r + 4}
                    className="fill-none stroke-brand animate-pulse"
                    strokeWidth={1}
                    opacity={0.5}
                  />
                )}
                <text
                  x={n.x} y={n.y - n.r - 6}
                  textAnchor="middle"
                  className="fill-text-primary text-[9px]"
                >
                  {(n.uri || n.node_uuid).slice(0, 24)}
                </text>
                <text
                  x={n.x} y={n.y + n.r + 12}
                  textAnchor="middle"
                  className="fill-text-muted text-[8px]"
                >
                  {(n.score * 100).toFixed(0)}%
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-text-muted">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-brand/80 border border-brand" />
          {t('brain.wmNodes')}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-surface-secondary border border-text-muted" />
          {t('brain.candidates')}
        </div>
      </div>

      {/* Detail list */}
      <div className="space-y-1 max-h-[200px] overflow-y-auto pr-1">
        {visualNodes.slice(0, 12).map(n => (
          <div key={n.node_uuid} className="flex items-center gap-2 px-2 py-1 rounded bg-surface-secondary text-xs">
            <div className={`w-2 h-2 rounded-full ${n.isWm ? 'bg-brand' : 'bg-text-muted/40'}`} />
            <div className="flex-1 min-w-0 truncate text-text-primary">{n.uri || n.node_uuid}</div>
            <div className="text-text-muted">{(n.score * 100).toFixed(0)}%</div>
            <div className="text-text-muted text-[10px]">
              {n.isInserted ? 'inserted' : n.isRefreshed ? 'refreshed' : '—'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function BrainPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('activation');
  const namespace = useNamespace();

  const tabs = [
    { id: 'activation', label: t('brain.activatedNodes'), icon: Activity },
    { id: 'dream', label: t('brain.dreamLog'), icon: BrainCircuit },
    { id: 'network', label: t('brain.associativeNetwork'), icon: GitBranch },
    { id: 'operation', label: t('brain.operation'), icon: Radio },
  ];

  if (namespace === null) {
    return (
      <div className="h-full flex flex-col bg-bg-primary">
        <div className="px-6 py-4 border-b border-border-primary bg-surface-primary">
          <div className="flex items-center gap-2">
            <BrainCircuit size={20} className="text-brand" />
            <h1 className="text-lg font-semibold text-text-primary">{t('brain.title')}</h1>
          </div>
          <p className="text-xs text-text-muted mt-1">{t('brain.subtitle')}</p>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-text-muted text-sm animate-pulse">{t('app.loading')}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border-primary bg-surface-primary">
        <div className="flex items-center gap-2">
          <BrainCircuit size={20} className="text-brand" />
          <h1 className="text-lg font-semibold text-text-primary">{t('brain.title')}</h1>
        </div>
        <p className="text-xs text-text-muted mt-1">{t('brain.subtitle')}</p>
        <p className="text-xs text-brand mt-1">Namespace: {namespace}</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border-primary bg-surface-primary px-4">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
              activeTab === tab.id
                ? 'border-brand text-brand'
                : 'border-transparent text-text-tertiary hover:text-text-secondary'
            }`}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <StatsPanel namespace={namespace} />
        {activeTab === 'activation' && (
          <div className="max-w-2xl">
            <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
              <Eye size={14} /> {t('brain.activatedNodes')}
            </h2>
            <ActivationPanel namespace={namespace} />
          </div>
        )}
        {activeTab === 'dream' && (
          <div className="max-w-2xl">
            <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
              <Clock size={14} /> {t('brain.episodicMemory')}
            </h2>
            <DreamLogPanel namespace={namespace} />
          </div>
        )}
        {activeTab === 'network' && (
          <div className="max-w-2xl">
            <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
              <GitBranch size={14} /> {t('brain.associativeNetwork')}
            </h2>
            <NetworkExplorer />
          </div>
        )}
        {activeTab === 'operation' && (
          <div className="max-w-2xl">
            <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
              <Radio size={14} /> {t('brain.operation')}
            </h2>
            <OperationPanel namespace={namespace} />
          </div>
        )}
      </div>
    </div>
  );
}
