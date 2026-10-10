// src/api/index.js
import axios from 'axios';

// In development CRA proxies /api to the backend (package.json "proxy"), so an empty base URL
// works both locally and in Docker. REACT_APP_API_URL overrides it for other deployments.
const API_URL = process.env.REACT_APP_API_URL || '';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.message || error.message || 'Request failed';
    const details = error.response?.data?.errors;
    const wrapped = new Error(details?.length ? `${message}: ${details.join(', ')}` : message);
    wrapped.status = error.response?.status;
    return Promise.reject(wrapped);
  }
);

const data = (p) => p.then((r) => r.data);

// Absolute backend origin for streaming transports (EventSource). Dev-server proxies can buffer
// text/event-stream, so SSE connects to the API port directly (CORS is enabled on the backend).
export function backendOrigin() {
  if (process.env.REACT_APP_API_URL) return process.env.REACT_APP_API_URL.replace(/\/$/, '');
  const { protocol, hostname, port } = window.location;
  return port === '3000' ? `${protocol}//${hostname}:8080` : `${protocol}//${window.location.host}`;
}

export const dashboardStreamUrl = (params) => `${backendOrigin()}/api/analytics/stream?${new URLSearchParams(params)}`;

export const SUPERVISOR_ID = 'supervisor-001';

// Conversations
export const getConversations = (params = {}) => data(api.get('/api/conversations', { params }));
export const getConversation = (id) => data(api.get(`/api/conversations/${id}`));
export const getCopilot = (id, currency) => data(api.get(`/api/conversations/${id}/copilot`, { params: { currency } }));
export const addMessage = (conversationId, message) => data(api.post(`/api/conversations/${conversationId}/messages`, message));
export const updateConversationStatus = (conversationId, status) => data(api.patch(`/api/conversations/${conversationId}/status`, { status }));
export const addTags = (conversationId, tags) => data(api.post(`/api/conversations/${conversationId}/tags`, { tags }));
export const recordCopilotDecision = (conversationId, decision, actionLabel) =>
  data(api.post(`/api/conversations/${conversationId}/copilot/decision`, { decision, actionLabel }));
export const saveFeedback =(conversationId, feedback) => data(api.put(`/api/conversations/${conversationId}/feedback`, feedback));

// Intervention
export const interveneInConversation = (conversationId, notes = '', supervisorId = SUPERVISOR_ID) =>
  data(api.post('/api/intervene', { conversationId, supervisorId, notes }));
export const releaseIntervention = (conversationId, supervisorNotes) =>
  data(api.post('/api/intervene/release', { conversationId, supervisorNotes }));

// Agents
export const getAgents = () => data(api.get('/api/agents'));
export const getAgent = (id) => data(api.get(`/api/agents/${id}`));
export const updateAgentConfig = (id, config) => data(api.patch(`/api/agents/${id}/config`, config));
export const getAgentMetrics = (id) => data(api.get(`/api/agents/${id}/metrics`));
export const getAgentPerformance = (id, range) => data(api.get(`/api/agents/${id}/performance`, { params: { range } }));
export const getAgentEvaluation = (id) => data(api.get(`/api/agents/${id}/evaluation`));
export const runAgentEvaluation = (id, config) => data(api.post(`/api/agents/${id}/evaluate`, config ? { config } : {}));
export const simulateAgent = (id, body) => data(api.post(`/api/agents/${id}/simulate`, body));

// Presets
export const getPresets = () => data(api.get('/api/presets'));
export const createPreset = (preset) => data(api.post('/api/presets', preset));
export const deletePreset = (id) => data(api.delete(`/api/presets/${id}`));

// Templates
export const getTemplates = (params = {}) => data(api.get('/api/templates', { params }));
export const getTemplate = (id) => data(api.get(`/api/templates/${id}`));
export const createTemplate = (template) => data(api.post('/api/templates', template));
export const updateTemplate = (id, patch) => data(api.patch(`/api/templates/${id}`, patch));
export const deleteTemplate = (id) => data(api.delete(`/api/templates/${id}`));

// Knowledge base
export const getKnowledgeBases = () => data(api.get('/api/knowledge-base'));

// Analytics & system
export const getDashboard = (params) => data(api.get('/api/analytics/dashboard', { params }));
export const getAnalytics = (params) => data(api.get('/api/analytics/overview', { params }));
export const getActivity = (limit = 20) => data(api.get('/api/activity', { params: { limit } }));
export const search = (q) => data(api.get('/api/search', { params: { q } }));
export const getSystemStatus = () => data(api.get('/api/system/status'));
export const setSimulation = (enabled) => data(api.post('/api/system/simulation', { enabled }));
export const resetDemoData = () => data(api.post('/api/system/reset'));

export default api;
