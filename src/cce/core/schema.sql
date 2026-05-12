-- ============================================================
-- Cat's Context Engine — Database Schema (bun:sqlite)
-- ============================================================

CREATE TABLE IF NOT EXISTS _schema_version (
    version INTEGER PRIMARY KEY,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 节点表：概念实体，UUID 跨版本不变
CREATE TABLE IF NOT EXISTS nodes (
    uuid TEXT PRIMARY KEY,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 根节点：所有顶层路径的 parent_uuid
INSERT OR IGNORE INTO nodes (uuid) VALUES ('00000000-0000-0000-0000-000000000000');

-- 记忆表：节点的内容版本
CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_uuid TEXT REFERENCES nodes(uuid),
    content TEXT NOT NULL,
    deprecated INTEGER DEFAULT 0,
    migrated_to INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 边表：父→子关系，携带元数据
CREATE TABLE IF NOT EXISTS edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_uuid TEXT NOT NULL REFERENCES nodes(uuid),
    child_uuid TEXT NOT NULL REFERENCES nodes(uuid),
    name TEXT NOT NULL,
    priority INTEGER DEFAULT 0,
    disclosure TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(parent_uuid, child_uuid)
);

-- 路径表：URI 路由缓存 (namespace, domain, path) → edge
CREATE TABLE IF NOT EXISTS paths (
    rowid INTEGER PRIMARY KEY AUTOINCREMENT,
    namespace TEXT NOT NULL DEFAULT '',
    domain TEXT NOT NULL DEFAULT 'code',
    path TEXT NOT NULL,
    edge_id INTEGER REFERENCES edges(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(namespace, domain, path)
);

-- 词汇表关键词绑定
CREATE TABLE IF NOT EXISTS glossary_keywords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    keyword TEXT NOT NULL,
    node_uuid TEXT NOT NULL REFERENCES nodes(uuid) ON DELETE CASCADE,
    namespace TEXT NOT NULL DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(keyword, node_uuid, namespace)
);

-- 上下文向量表：用于混合搜索（关键词 + 语义）
CREATE TABLE IF NOT EXISTS context_vectors (
    rowid INTEGER PRIMARY KEY AUTOINCREMENT,
    namespace TEXT NOT NULL DEFAULT '',
    domain TEXT NOT NULL DEFAULT 'code',
    path TEXT NOT NULL,
    node_uuid TEXT NOT NULL REFERENCES nodes(uuid) ON DELETE CASCADE,
    memory_id INTEGER NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    uri TEXT NOT NULL,
    content TEXT NOT NULL,
    disclosure TEXT,
    search_terms TEXT NOT NULL DEFAULT '',
    priority INTEGER NOT NULL DEFAULT 0,
    embedding BLOB,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(namespace, domain, path)
);

-- FTS5 全文索引（关键词搜索）
CREATE VIRTUAL TABLE IF NOT EXISTS context_vectors_fts USING fts5(
    namespace, domain, path, uri, content, disclosure, search_terms,
    content='context_vectors',
    content_rowid='rowid'
);

-- 辅助索引
CREATE INDEX IF NOT EXISTS idx_memories_node ON memories(node_uuid, deprecated);
CREATE INDEX IF NOT EXISTS idx_edges_parent ON edges(parent_uuid);
CREATE INDEX IF NOT EXISTS idx_edges_child ON edges(child_uuid);
CREATE INDEX IF NOT EXISTS idx_paths_ns_domain ON paths(namespace, domain);
CREATE INDEX IF NOT EXISTS idx_glossary_kw ON glossary_keywords(keyword, namespace);

-- Code-Memory 关联表
CREATE TABLE IF NOT EXISTS code_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    memory_node_uuid TEXT NOT NULL REFERENCES nodes(uuid) ON DELETE CASCADE,
    code_node_uuid TEXT NOT NULL REFERENCES nodes(uuid) ON DELETE CASCADE,
    namespace TEXT NOT NULL DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(memory_node_uuid, code_node_uuid, namespace)
);

CREATE INDEX IF NOT EXISTS idx_code_links_memory ON code_links(memory_node_uuid, namespace);
CREATE INDEX IF NOT EXISTS idx_code_links_code ON code_links(code_node_uuid, namespace);
CREATE INDEX IF NOT EXISTS idx_context_vectors_node ON context_vectors(node_uuid, namespace);

-- ============================================================
-- Phase 1: Brain Memory System — Associative, Evidential, Dynamic
-- ============================================================

-- 联想网络：替代简陋的 code_links，支持类型、权重、Hebbian 学习
CREATE TABLE IF NOT EXISTS associative_edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_uuid TEXT NOT NULL REFERENCES nodes(uuid),
    target_uuid TEXT NOT NULL REFERENCES nodes(uuid),
    edge_type TEXT NOT NULL DEFAULT 'associates',
    weight REAL DEFAULT 0.5,
    confidence REAL DEFAULT 1.0,
    evidence TEXT,
    activation_count INTEGER DEFAULT 0,
    last_activated_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source_uuid, target_uuid, edge_type)
);
CREATE INDEX IF NOT EXISTS idx_assoc_source ON associative_edges(source_uuid, edge_type, weight);
CREATE INDEX IF NOT EXISTS idx_assoc_target ON associative_edges(target_uuid, edge_type, weight);
CREATE INDEX IF NOT EXISTS idx_assoc_activated ON associative_edges(last_activated_at);

-- 概念证据：concept 必须指向支撑它的 code/episode
CREATE TABLE IF NOT EXISTS concept_evidence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    concept_node_uuid TEXT NOT NULL REFERENCES nodes(uuid),
    evidence_node_uuid TEXT NOT NULL REFERENCES nodes(uuid),
    evidence_type TEXT NOT NULL DEFAULT 'signature_match',
    strength REAL DEFAULT 1.0,
    verified_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(concept_node_uuid, evidence_node_uuid, evidence_type)
);
CREATE INDEX IF NOT EXISTS idx_ce_concept ON concept_evidence(concept_node_uuid, strength);
CREATE INDEX IF NOT EXISTS idx_ce_evidence ON concept_evidence(evidence_node_uuid);

-- 节点激活状态：决定工作记忆准入
CREATE TABLE IF NOT EXISTS node_activation (
    node_uuid TEXT PRIMARY KEY REFERENCES nodes(uuid),
    baseline_activation REAL DEFAULT 0.0,
    current_activation REAL DEFAULT 0.0,
    total_activation_count INTEGER DEFAULT 0,
    last_activated_at DATETIME,
    last_decayed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 情景记忆：记录"什么时候、在什么情境下"想起了某个记忆
CREATE TABLE IF NOT EXISTS memory_episodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_uuid TEXT NOT NULL REFERENCES nodes(uuid),
    episode_type TEXT NOT NULL,
    trigger_uri TEXT,
    trigger_text TEXT,
    working_memory_snapshot TEXT,
    embedding BLOB,
    activation_strength REAL DEFAULT 1.0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_episodes_node ON memory_episodes(node_uuid, created_at);
CREATE INDEX IF NOT EXISTS idx_episodes_type ON memory_episodes(episode_type, created_at);

-- Schema version marker
INSERT OR IGNORE INTO _schema_version (version) VALUES (1);
