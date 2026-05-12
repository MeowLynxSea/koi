import axios from 'axios';

export const api = axios.create({
  baseURL: '/api'
});

const encodeId = (id) => encodeURIComponent(id);

// ============ Browse API ============

export const getDomains = () =>
  api.get('/browse/domains').then(res => res.data);

export const getNamespaces = () =>
  api.get('/browse/namespaces').then(res => res.data);

// ============ Namespace Management API ============

export const getNamespaceStats = () =>
  api.get('/namespaces').then(res => res.data);

export const deleteNamespace = (name) =>
  api.delete('/namespaces', { params: { name } }).then(res => res.data);

export const renameNamespace = (name, newName) =>
  api.put('/namespaces', { new_name: newName }, { params: { name } }).then(res => res.data);

// ============ Brain Memory API ============

export const getTopActivated = (limit = 20, minActivation = 0.01) =>
  api.get('/brain/top-activated', { params: { limit, min_activation: minActivation } }).then(res => res.data);

export const getNodeNeighbors = (nodeUuid, edgeType, minWeight = 0.1) =>
  api.get(`/brain/neighbors/${encodeId(nodeUuid)}`, { params: { edge_type: edgeType, min_weight: minWeight } }).then(res => res.data);

export const getNodeActivation = (nodeUuid) =>
  api.get(`/brain/activation/${encodeId(nodeUuid)}`).then(res => res.data);

export const getNodeEpisodes = (nodeUuid, limit = 20) =>
  api.get(`/brain/episodes/${encodeId(nodeUuid)}`, { params: { limit } }).then(res => res.data);

export const getConceptEvidence = (nodeUuid) =>
  api.get(`/brain/concept-evidence/${encodeId(nodeUuid)}`).then(res => res.data);

export const getDreamLog = (limit = 50) =>
  api.get('/brain/dream-log', { params: { limit } }).then(res => res.data);

export const getBrainStats = () =>
  api.get('/brain/stats').then(res => res.data);

export const getWorkingMemory = () =>
  api.get('/brain/working-memory').then(res => res.data);

export const getLastOperation = () =>
  api.get('/brain/last-operation').then(res => res.data);

export default api;
