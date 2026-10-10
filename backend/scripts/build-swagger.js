// Builds swagger.json (OpenAPI 3) — run with: node scripts/build-swagger.js
const fs = require('fs');

const ref = (n) => ({ $ref: `#/components/schemas/${n}` });
const json = (schema, description = 'OK') => ({ description, content: { 'application/json': { schema } } });
const body = (schema, required = true) => ({ required, content: { 'application/json': { schema } } });
const idParam = (name = 'id', description) => ({ name, in: 'path', required: true, schema: { type: 'string' }, description });
const q = (name, schema, description) => ({ name, in: 'query', required: false, schema, description });
const notFound = json(ref('Error'), 'Not found');
const bad = json(ref('Error'), 'Validation error');

const spec = {
  openapi: '3.0.3',
  info: {
    title: 'AI Agent Supervisor API',
    version: '1.0.0',
    description: 'Monitor, intervene in and configure AI customer-service agents. Real-time events are pushed over a WebSocket at ws://localhost:8080 (see the "WebSocket" tag).'
  },
  servers: [{ url: 'http://localhost:8080' }],
  tags: [
    { name: 'Conversations' }, { name: 'Intervention' }, { name: 'Agents' }, { name: 'Presets' },
    { name: 'Templates', description: 'Response templates with {{variable}} substitution' },
    { name: 'Analytics' }, { name: 'Knowledge' }, { name: 'LLM (mock)' }, { name: 'System' },
    { name: 'WebSocket', description: 'Server → client: connection, ping, conversations_update, new_conversation, message_update, metrics_update, conversation_updated, alert, activity, agent_update, analytics_update, template_created|updated|deleted, preset_created|deleted, system_update. Client → server: subscribe {channel, parameters: {agentId}}, pong.' }
  ],
  paths: {
    '/health': { get: { tags: ['System'], summary: 'Health check', responses: { 200: json({ type: 'object' }) } } },
    '/api/conversations': {
      get: {
        tags: ['Conversations'], summary: 'List conversations (paginated, filterable)',
        parameters: [
          q('page', { type: 'integer', default: 1 }), q('limit', { type: 'integer', default: 10, maximum: 200 }),
          q('status', { type: 'string' }, 'active | waiting | resolved | escalated (comma-separated allowed)'),
          q('alertLevel', { type: 'string' }, 'low | medium | high (comma-separated allowed)'),
          q('agentId', { type: 'string' }), q('queue', { type: 'string' }), q('region', { type: 'string' }),
          q('q', { type: 'string' }, 'Search customer name, case number, tag or issue'),
          q('sort', { type: 'string', enum: ['recent', 'risk'] }), q('view', { type: 'string', enum: ['summary'] }, 'Omit messages (last message only)')
        ],
        responses: { 200: json({ type: 'object', properties: { data: { type: 'array', items: ref('Conversation') }, pagination: ref('Pagination') } }) }
      }
    },
    '/api/conversations/{id}': { get: { tags: ['Conversations'], summary: 'Get one conversation (with live risk assessment)', parameters: [idParam()], responses: { 200: json(ref('Conversation')), 404: notFound } } },
    '/api/conversations/{id}/messages': {
      post: {
        tags: ['Conversations'], summary: 'Add a message', parameters: [idParam()],
        requestBody: body({ type: 'object', required: ['sender', 'text'], properties: { sender: { type: 'string', enum: ['customer', 'agent', 'supervisor', 'system'] }, text: { type: 'string' }, templateId: { type: 'string', description: 'Records template usage' } } }),
        responses: { 201: json(ref('Message')), 400: bad, 404: notFound }
      }
    },
    '/api/conversations/{id}/status': {
      patch: { tags: ['Conversations'], summary: 'Update status', parameters: [idParam()], requestBody: body({ type: 'object', properties: { status: { type: 'string', enum: ['active', 'waiting', 'resolved', 'escalated'] } } }), responses: { 200: json({ type: 'object' }), 400: bad, 404: notFound } }
    },
    '/api/conversations/{id}/tags': {
      post: { tags: ['Conversations'], summary: 'Add tags', parameters: [idParam()], requestBody: body({ type: 'object', properties: { tags: { type: 'array', items: { type: 'string' } } } }), responses: { 200: json({ type: 'object' }), 400: bad, 404: notFound } }
    },
    '/api/conversations/{id}/feedback': {
      put: { tags: ['Conversations'], summary: 'Save supervisor feedback on the agent (notes + rating)', parameters: [idParam()], requestBody: body({ type: 'object', properties: { notes: { type: 'string' }, rating: { type: 'integer', enum: [-1, 1] } } }), responses: { 200: json({ type: 'object' }), 404: notFound } }
    },
    '/api/conversations/{id}/copilot': {
      get: { tags: ['Conversations'], summary: 'Co-pilot recommendation (action, reply, evidence, confidence)', parameters: [idParam(), q('currency', { type: 'string', enum: ['INR', 'USD'] })], responses: { 200: json(ref('Recommendation')), 404: notFound } }
    },
    '/api/conversations/{id}/copilot/decision': {
      post: { tags: ['Conversations'], summary: 'Record approve / escalate decision on the recommendation', parameters: [idParam()], requestBody: body({ type: 'object', properties: { decision: { type: 'string', enum: ['approve', 'escalate'] }, actionLabel: { type: 'string' } } }), responses: { 200: json({ type: 'object' }), 400: bad } }
    },
    '/api/intervene': {
      post: { tags: ['Intervention'], summary: 'Take over a conversation from the AI', requestBody: body({ type: 'object', required: ['conversationId', 'supervisorId'], properties: { conversationId: { type: 'string' }, supervisorId: { type: 'string' }, notes: { type: 'string' } } }), responses: { 200: json({ type: 'object' }), 400: bad, 404: notFound } }
    },
    '/api/intervene/release': {
      post: { tags: ['Intervention'], summary: 'Return control to the AI with guidance notes', requestBody: body({ type: 'object', required: ['conversationId'], properties: { conversationId: { type: 'string' }, supervisorNotes: { type: 'string' } } }), responses: { 200: json({ type: 'object' }), 400: bad, 404: notFound, 409: json(ref('Error'), 'Already released — guarded on the active state, no duplicate handoff note') } }
    },
    '/api/agents': { get: { tags: ['Agents'], summary: 'List agents', responses: { 200: json({ type: 'array', items: ref('Agent') }) } } },
    '/api/agents/{id}': { get: { tags: ['Agents'], summary: 'Get an agent', parameters: [idParam()], responses: { 200: json(ref('Agent')), 404: notFound } } },
    '/api/agents/{id}/config': {
      patch: {
        tags: ['Agents'], summary: 'Update configuration (optionally deploy as a governed change request)', parameters: [idParam()],
        requestBody: body({ allOf: [ref('AgentConfig'), { type: 'object', properties: { changeRequest: { type: 'object', properties: { notes: { type: 'string' } }, description: 'When present and fields changed: bumps version, records CR, snapshots previous config' } } }] }),
        responses: { 200: json({ type: 'object' }), 400: bad, 404: notFound }
      }
    },
    '/api/agents/{id}/metrics': { get: { tags: ['Agents'], summary: 'Agent performance metrics', parameters: [idParam()], responses: { 200: json({ type: 'object' }), 404: notFound } } },
    '/api/agents/{id}/performance': { get: { tags: ['Agents'], summary: 'Containment, CSAT, fallback and hallucination with deltas', parameters: [idParam(), q('range', { type: 'string', enum: ['24h', '7d'] })], responses: { 200: json({ type: 'object' }) } } },
    '/api/agents/{id}/evaluation': { get: { tags: ['Agents'], summary: 'Latest evaluation suite result', parameters: [idParam()], responses: { 200: json(ref('Evaluation')) } } },
    '/api/agents/{id}/evaluate': { post: { tags: ['Agents'], summary: 'Run the evaluation suite (live config, or a draft in the body)', parameters: [idParam()], requestBody: body({ type: 'object', properties: { config: ref('AgentConfig') } }, false), responses: { 200: json(ref('Evaluation')) } } },
    '/api/agents/{id}/simulate': { post: { tags: ['Agents'], summary: 'Replay a scenario in the simulation console', parameters: [idParam()], requestBody: body({ type: 'object', properties: { index: { type: 'integer' }, config: ref('AgentConfig'), compare: { type: 'boolean' }, currency: { type: 'string' } } }, false), responses: { 200: json({ type: 'object' }) } } },
    '/api/presets': {
      get: { tags: ['Presets'], summary: 'List configuration presets', responses: { 200: json({ type: 'array', items: ref('Preset') }) } },
      post: { tags: ['Presets'], summary: 'Save a configuration preset', requestBody: body({ type: 'object', required: ['name', 'config'], properties: { name: { type: 'string' }, description: { type: 'string' }, sourceAgentId: { type: 'string' }, config: ref('AgentConfig') } }), responses: { 201: json(ref('Preset')), 400: bad, 409: json(ref('Error'), 'Duplicate name') } }
    },
    '/api/presets/{id}': { delete: { tags: ['Presets'], summary: 'Delete a preset', parameters: [idParam()], responses: { 200: json({ type: 'object' }), 404: notFound } } },
    '/api/presets/{id}/apply': { post: { tags: ['Presets'], summary: 'Apply a preset directly to an agent', parameters: [idParam()], requestBody: body({ type: 'object', properties: { agentId: { type: 'string' } } }), responses: { 200: json({ type: 'object' }), 404: notFound } } },
    '/api/templates': {
      get: { tags: ['Templates'], summary: 'List templates', parameters: [q('shared', { type: 'boolean' }), q('q', { type: 'string' }), q('category', { type: 'string' }), q('channel', { type: 'string' }), q('scope', { type: 'string', enum: ['team', 'recent'] }), q('sort', { type: 'string', enum: ['usage', 'recent', 'updated', 'name'] })], responses: { 200: json({ type: 'array', items: ref('Template') }) } },
      post: { tags: ['Templates'], summary: 'Create a template (variables are detected from {{placeholders}})', requestBody: body(ref('TemplateInput')), responses: { 201: json(ref('Template')), 400: bad } }
    },
    '/api/templates/{id}': {
      get: { tags: ['Templates'], summary: 'Get a template', parameters: [idParam()], responses: { 200: json(ref('Template')), 404: notFound } },
      patch: { tags: ['Templates'], summary: 'Update a template', parameters: [idParam()], requestBody: body(ref('TemplateInput')), responses: { 200: json(ref('Template')), 404: notFound } },
      delete: { tags: ['Templates'], summary: 'Delete a template', parameters: [idParam()], responses: { 200: json({ type: 'object' }), 404: notFound } }
    },
    '/api/templates/{id}/render': { post: { tags: ['Templates'], summary: 'Substitute variables (from a conversation and/or explicit values)', parameters: [idParam()], requestBody: body({ type: 'object', properties: { conversationId: { type: 'string' }, variables: { type: 'object', additionalProperties: { type: 'string' } } } }, false), responses: { 200: json({ type: 'object', properties: { text: { type: 'string' }, resolved: { type: 'array', items: { type: 'string' } }, unresolved: { type: 'array', items: { type: 'string' } } } }) } } },
    '/api/analytics/dashboard': { get: { tags: ['Analytics'], summary: 'Everything the monitoring dashboard renders', parameters: [q('range', { type: 'string', enum: ['30m', '2h', '24h', '7d'] }), q('region', { type: 'string' })], responses: { 200: json({ type: 'object' }) } } },
    '/api/analytics/stream': { get: { tags: ['Analytics'], summary: 'Server-Sent Events: dashboard metrics every 2 seconds (event: metrics)', description: 'text/event-stream. Each `metrics` event carries kpis, series, queueHealth, signals and scope for the given range/region. Consume with EventSource; the browser reconnects automatically (retry: 3000).', parameters: [q('range', { type: 'string', enum: ['30m', '2h', '24h', '7d'] }), q('region', { type: 'string' })], responses: { 200: { description: 'Event stream', content: { 'text/event-stream': { schema: { type: 'string' } } } } } } },
    '/api/analytics/overview': { get: { tags: ['Analytics'], summary: 'Overview analytics', parameters: [q('timeRange', { type: 'string', enum: ['today', 'week', 'month', 'year'] })], responses: { 200: json({ type: 'object' }) } } },
    '/api/analytics/agents': { get: { tags: ['Analytics'], summary: 'Agent analytics', parameters: [q('timeRange', { type: 'string' }), q('agentId', { type: 'string' })], responses: { 200: json({ type: 'object' }) } } },
    '/api/analytics/issues': { get: { tags: ['Analytics'], summary: 'Issue analytics', parameters: [q('timeRange', { type: 'string' })], responses: { 200: json({ type: 'object' }) } } },
    '/api/knowledge-base': { get: { tags: ['Knowledge'], summary: 'List knowledge bases', responses: { 200: json({ type: 'array', items: { type: 'object' } }) } } },
    '/api/vector/search': { post: { tags: ['Knowledge'], summary: 'Search knowledge (mock vector search)', requestBody: body({ type: 'object', properties: { query: { type: 'string' }, knowledgeBases: { type: 'array', items: { type: 'string' } }, limit: { type: 'integer' } } }), responses: { 200: json({ type: 'object' }) } } },
    '/api/vector/kb/{id}': { get: { tags: ['Knowledge'], summary: 'Knowledge base content', parameters: [idParam()], responses: { 200: json({ type: 'object' }), 404: notFound } } },
    '/api/llm/generate': { post: { tags: ['LLM (mock)'], summary: 'Generate an agent response', requestBody: body({ type: 'object', properties: { conversationId: { type: 'string' }, messages: { type: 'array', items: { type: 'object', properties: { role: { type: 'string' }, content: { type: 'string' } } } }, parameters: { type: 'object' } } }), responses: { 200: json({ type: 'object' }) } } },
    '/api/llm/sentiment': { post: { tags: ['LLM (mock)'], summary: 'Analyse sentiment', requestBody: body({ type: 'object', properties: { text: { type: 'string' } } }), responses: { 200: json({ type: 'object' }) } } },
    '/api/activity': { get: { tags: ['System'], summary: 'Live supervisor feed', parameters: [q('limit', { type: 'integer', default: 20 })], responses: { 200: json({ type: 'array', items: { type: 'object' } }) } } },
    '/api/search': { get: { tags: ['System'], summary: 'Global search across conversations, agents and templates', parameters: [q('q', { type: 'string' })], responses: { 200: json({ type: 'object' }) } } },
    '/api/system/status': { get: { tags: ['System'], summary: 'Simulator and connection status', responses: { 200: json({ type: 'object' }) } } },
    '/api/system/simulation': { post: { tags: ['System'], summary: 'Pause / resume the traffic simulator', requestBody: body({ type: 'object', properties: { enabled: { type: 'boolean' } } }), responses: { 200: json({ type: 'object' }) } } },
    '/api/system/reset': { post: { tags: ['System'], summary: 'Restore the demo dataset', responses: { 200: json({ type: 'object' }) } } }
  },
  components: {
    schemas: {
      Error: { type: 'object', properties: { message: { type: 'string' }, errors: { type: 'array', items: { type: 'string' } } } },
      Pagination: { type: 'object', properties: { total: { type: 'integer' }, page: { type: 'integer' }, pages: { type: 'integer' }, limit: { type: 'integer' } } },
      Message: { type: 'object', properties: { sender: { type: 'string' }, text: { type: 'string' }, timestamp: { type: 'string', format: 'date-time' }, templateId: { type: 'string' } } },
      Risk: { type: 'object', description: 'Computed on every read', properties: { score: { type: 'integer', minimum: 0, maximum: 100 }, severity: { type: 'string', enum: ['critical', 'high', 'watch', 'stable'] }, alertLevel: { type: 'string' }, action: { type: 'string', enum: ['take_over', 'approve_override', 'review_evidence', 'monitor', 'send_template', 'reply', 'none'] }, breaches: { type: 'array', items: { type: 'string' } }, slaRemainingSeconds: { type: 'integer' }, headline: { type: 'string' }, cause: { type: 'string' }, diagnostics: { type: 'object' } } },
      Conversation: {
        type: 'object',
        properties: {
          id: { type: 'string' }, caseNumber: { type: 'string' },
          customer: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, tier: { type: 'string' }, lifetimeValue: { type: 'number' } } },
          agent: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } },
          status: { type: 'string', enum: ['active', 'waiting', 'resolved', 'escalated'] }, alertLevel: { type: 'string', enum: ['low', 'medium', 'high'] },
          queue: { type: 'string' }, region: { type: 'string' }, startTime: { type: 'string', format: 'date-time' },
          metrics: { type: 'object', properties: { sentiment: { type: 'number' }, responseTime: { type: 'number' }, confidenceScore: { type: 'number' } } },
          messages: { type: 'array', items: ref('Message') }, tags: { type: 'array', items: { type: 'string' } },
          humanIntervention: { type: 'object', properties: { occurred: { type: 'boolean' }, active: { type: 'boolean' }, supervisorId: { type: 'string' }, timestamp: { type: 'string' }, notes: { type: 'string' } } },
          risk: ref('Risk')
        }
      },
      Recommendation: { type: 'object', properties: { title: { type: 'string' }, reply: { type: 'string' }, evidence: { type: 'array', items: { type: 'string' } }, confidence: { type: 'number' }, citations: { type: 'array', items: { type: 'object' } } } },
      AgentConfig: {
        type: 'object',
        properties: {
          parameters: { type: 'object', properties: { temperature: { type: 'number', minimum: 0, maximum: 1 }, max_tokens: { type: 'integer', minimum: 16, maximum: 4000 }, top_p: { type: 'number', minimum: 0, maximum: 1 }, empathy: { type: 'number', minimum: 0, maximum: 1 } } },
          capabilities: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, enabled: { type: 'boolean' } } } },
          knowledgeBases: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, enabled: { type: 'boolean' } } } },
          escalationThresholds: { type: 'object', properties: { lowConfidence: { type: 'number' }, negativeSentiment: { type: 'number', description: '0..1 scale (UI shows −1..1)' }, responseTime: { type: 'integer', description: 'seconds without an AI reply' }, refundValue: { type: 'number', description: 'INR' } } }
        }
      },
      Agent: { allOf: [ref('AgentConfig'), { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, model: { type: 'string' }, version: { type: 'string' }, routing: { type: 'array', items: { type: 'object' } }, metrics: { type: 'object' } } }] },
      Evaluation: { type: 'object', properties: { scenarios: { type: 'integer' }, ranAt: { type: 'string' }, results: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, score: { type: 'number' }, status: { type: 'string', enum: ['pass', 'review', 'risk'] } } } } } },
      Preset: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' }, config: ref('AgentConfig') } },
      TemplateInput: {
        type: 'object', required: ['name', 'category', 'content'],
        properties: {
          name: { type: 'string' }, description: { type: 'string' }, category: { type: 'string' }, channels: { type: 'array', items: { type: 'string' } },
          content: { type: 'string', description: 'Plain text or sanitized HTML with {{variable}} placeholders' },
          variables: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' } } } },
          ctaLabel: { type: 'string' }, isShared: { type: 'boolean' }, starred: { type: 'boolean' }
        }
      },
      Template: { allOf: [ref('TemplateInput'), { type: 'object', properties: { id: { type: 'string' }, createdBy: { type: 'string' }, usageCount: { type: 'integer' }, lastUsedAt: { type: 'string' }, createdAt: { type: 'string' }, updatedAt: { type: 'string' } } }] }
    }
  }
};

fs.writeFileSync(require('path').join(__dirname, '..', 'swagger.json'), `${JSON.stringify(spec, null, 2)}\n`);
console.log(`swagger.json written: ${Object.keys(spec.paths).length} paths`);
