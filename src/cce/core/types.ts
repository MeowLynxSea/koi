/**
 * Core type definitions for Cat's Context Engine.
 */

export interface Node {
  uuid: string;
  created_at: string;
}

export interface Memory {
  id: number;
  node_uuid: string;
  content: string;
  deprecated: boolean;
  migrated_to: number | null;
  created_at: string;
}

export interface Edge {
  id: number;
  parent_uuid: string;
  child_uuid: string;
  name: string;
  priority: number;
  disclosure: string | null;
  created_at: string;
}

export interface PathEntry {
  rowid: number;
  namespace: string;
  domain: string;
  path: string;
  edge_id: number;
  created_at: string;
}

export interface GlossaryKeyword {
  id: number;
  keyword: string;
  node_uuid: string;
  namespace: string;
  created_at: string;
}

export interface ContextVector {
  rowid: number;
  namespace: string;
  domain: string;
  path: string;
  node_uuid: string;
  memory_id: number;
  uri: string;
  content: string;
  disclosure: string | null;
  search_terms: string;
  priority: number;
  embedding: Float32Array | null;
  updated_at: string;
}

export interface AssociativeEdge {
  id: number;
  source_uuid: string;
  target_uuid: string;
  edge_type: string;
  weight: number;
  confidence: number;
  evidence: string | null;
  activation_count: number;
  last_activated_at: string | null;
  created_at: string;
}

export interface ConceptEvidence {
  id: number;
  concept_node_uuid: string;
  evidence_node_uuid: string;
  evidence_type: string;
  strength: number;
  verified_at: string | null;
  created_at: string;
}

export interface NodeActivation {
  node_uuid: string;
  baseline_activation: number;
  current_activation: number;
  total_activation_count: number;
  last_activated_at: string | null;
  last_decayed_at: string | null;
  created_at: string;
}

export interface MemoryEpisode {
  id: number;
  node_uuid: string;
  episode_type: string;
  trigger_uri: string | null;
  trigger_text: string | null;
  working_memory_snapshot: string | null;
  embedding: Float32Array | null;
  activation_strength: number;
  created_at: string;
}

export interface CodeLink {
  id: number;
  memory_node_uuid: string;
  code_node_uuid: string;
  namespace: string;
  created_at: string;
}

// ─── API Result Types ───

export interface MemoryResult {
  id: number;
  node_uuid: string;
  content: string;
  priority: number;
  disclosure: string | null;
  deprecated: boolean;
  created_at: string | null;
  domain: string;
  path: string;
  alias_count: number;
}

export interface ChildNode {
  node_uuid: string;
  edge_id: number;
  name: string;
  domain: string;
  path: string;
  content_snippet: string;
  priority: number;
  disclosure: string | null;
  approx_children_count: number;
}

export interface PathItem {
  namespace: string;
  domain: string;
  path: string;
  uri: string;
  name: string;
  priority: number;
  memory_id: number;
  node_uuid: string;
}

export interface SearchResult {
  domain: string;
  path: string;
  node_uuid: string;
  uri: string;
  priority: number;
  snippet: string;
  disclosure: string | null;
  source: "keyword" | "vector";
  score?: number;
}

export interface ActivationResult {
  node_uuid: string;
  uri: string | null;
  score: number;
  components: {
    semantic: number;
    keyword: number;
    neighbor: number;
    recency: number;
    baseline: number;
  };
}

export interface WorkingMemorySlot {
  node_uuid: string;
  uri: string;
  content: string;
  injection_depth: "full" | "summary";
  activation_source: string;
  relevance_score: number;
  inserted_at: number;
  access_count: number;
}

export interface WorkingMemoryState {
  namespace: string;
  capacity: number;
  slots: WorkingMemorySlot[];
  last_updated: string | null;
}

export interface ScannedFile {
  path: string;
  rel_path: string;
  language: string;
  size_bytes: number;
  content_hash: string;
  signatures: string;
  tasks: TaskMarker[];
  content_preview: string;
  content: string;
}

export interface TaskMarker {
  kind: "TODO" | "FIXME" | "HACK" | "NOTE" | "XXX";
  text: string;
  line: number;
}

export const ROOT_NODE_UUID = "00000000-0000-0000-0000-000000000000";
export const EMBEDDING_DIM = 384;
export const WM_CAPACITY = 12;
