# Interview Prep: AI Agent Supervisor Workstation

Study guide for explaining this project. Paths are relative to the repository root.

Related: [Architecture](ARCHITECTURE.md), [Documentation](DOCUMENTATION.md).

## Contents

1. [The 60-second pitch](#1-the-60-second-pitch)
2. [The ask, and what each requirement means](#2-the-ask-and-what-each-requirement-means)
3. [The starter pack](#3-the-starter-pack)
4. [What was added and changed, folder by folder](#4-what-was-added-and-changed-folder-by-folder)
5. [How it works: six flows to know cold](#5-how-it-works-six-flows-to-know-cold)
6. [Concepts you must be able to explain](#6-concepts-you-must-be-able-to-explain)
7. [Decisions and trade-offs](#7-decisions-and-trade-offs)
8. [The mid-session requirements](#8-the-mid-session-requirements)
9. [How to talk about using AI](#9-how-to-talk-about-using-ai)
10. [Weak spots and what you would do next](#10-weak-spots-and-what-you-would-do-next)
11. [Question bank with answers](#11-question-bank-with-answers)
12. [Ten files to read before the interview](#12-ten-files-to-read-before-the-interview)
13. [Numbers to remember](#13-numbers-to-remember)
14. [One-day plan](#14-one-day-plan)

To run the app, see [Run it on this laptop](#run-it-on-this-laptop).

## Run it on this laptop

```bash
cd "/Users/lakshya/Documents/Workspace/AI Agent Supervisor Workstation/test-agent"
```

```bash
npm run dev
```

Then open http://localhost:3000. The API is on http://localhost:8080. Dependencies are already installed, so `npm run setup` is not needed. Stop with `Ctrl + C`.

To run the checks, open a second terminal in the same folder:

```bash
npm test
```

## 1. The 60-second pitch

Say this in your own words. Do not memorise it line by line.

> Zangoh builds AI agents that answer customer-service chats. A human supervisor still has to watch them, step in when the AI is failing, and tune how the agents behave. I built that supervisor console.
>
> It has four parts: a live dashboard that ranks conversations by risk, a conversation screen where the supervisor takes over and hands back with notes, a configuration screen for agent parameters and escalation rules, and a reply-template library with variables.
>
> The starter gave me an Express and MongoDB backend and a thin React shell. I built the frontend to the Figma design, fixed the starter defects that blocked it, added the endpoints that were missing, and handled the requirements that arrived mid-way: an SSE metrics stream, voice input, a mobile dashboard and a race-condition fix.
>
> I built it with Claude Code as a pair. I set direction, pulled the design through the Figma MCP, tested each screen myself, and decided what to keep. I can walk through any part of the code.

## 2. The ask, and what each requirement means

Time limit in the brief: 3 hours. Scoring: functionality 40%, code quality 25%, technical decisions 20%, design match 15%.

### Monitoring dashboard

| Requirement | What it means in practice | Where it lives |
| --- | --- | --- |
| Real-time view of conversations | The list updates without a page refresh when a message arrives or a risk score changes | `frontend/src/components/dashboard/PriorityQueue.js`, fed by WebSocket |
| Key metrics | Numbers a floor manager watches: how many chats are open, how many are about to breach the SLA, how often the AI resolves alone, how long cases take, how happy customers are | `frontend/src/components/dashboard/KpiCard.js`, computed in `backend/services/analytics.js` |
| Alert system | Flag the conversations that need a human before they go wrong | `backend/utils/risk.js`, `frontend/src/components/dashboard/CriticalSignals.js` |
| Filtering | Narrow the list by agent, status, alert level | Filter popover in `PriorityQueue.js` |

### Intervention

| Requirement | What it means | Where |
| --- | --- | --- |
| Full conversation history | Read everything said so far before stepping in | `frontend/src/components/conversation/MessageList.js` |
| Take over | The AI stops replying; the supervisor's messages go to the customer | `POST /api/intervene` in `backend/routes/intervene.js` |
| Return control with notes | Hand back to the AI with instructions so it continues with context | `POST /api/intervene/release`, `ReturnToAiModal.js` |
| Feedback on the agent | Record what the AI should have done better | `PUT /api/conversations/:id/feedback`, `CustomerIntel.js` |

### Agent configuration

| Requirement | What it means | Where |
| --- | --- | --- |
| Adjust AI parameters | `temperature` controls randomness, `max_tokens` caps reply length, `top_p` limits word choice to the most likely options | `frontend/src/components/agent/BehaviorPanel.js` |
| Enable or disable capabilities | Switch tools (order lookup, refunds) and knowledge bases on or off per agent | Same panel, Capabilities and Knowledge tabs |
| Escalation thresholds | Rules for when the AI must hand over: sentiment too low, confidence too low, no reply for too long, refund too large | `escalationThresholds` on the agent, enforced in `risk.js` and the simulator |
| Presets | Save a whole configuration under a name and load it later | `backend/routes/presets.js`, `PresetsMenu.js` |

### Response templates (the twist)

A template is a saved reply with blanks, such as `Hi {{user_name}}, your refund of {{refund_amount}} is approved`. "Variable substitution clearly indicated" means the supervisor must always see which blanks are filled, which are not, and must not be able to send a message with a raw `{{blank}}` in it.

## 3. The starter pack

### What was in it

```
backend-starter/
  server.js  mockLlmApi.js  vectorDbSetup.js  swagger.json
  routes/      agents  analytics  conversations  intervene  knowledgeBase
  models/      agent  conversation  knowledgeBase  responseTemplate
  websocket/   socketHandler.js
  utils/       helpers.js  seed.js
  middleware/  errorHandler.js  requestLogger.js
  data/        conversations.js
frontend-starter/src/
  app.js  index.js  theme.js  api/index.js
  pages/       Dashboard  ConversationView  AgentConfig  Analysis
  components/  Layout  Sidebar  Header  ConversationList  MetricsCard
  context/     AppDataContext  WebSocketContext
  utils/       dateUtils.js
testing/test-runner.js
docker-compose.yaml  docker/  data-samples/  mockups/
```

### What was wrong with it

| Defect | Effect |
| --- | --- |
| `socketHandler` imported the Express router as if it were data | The live feed always showed one dummy conversation |
| `mockLlmApi` required a wrong path and was never mounted | The mock AI could not be called |
| `/api/templates` did not exist although the contract listed it | The twist had nothing to call |
| `/api/analytics` was a stub | The dashboard metrics had no data |
| The frontend `.env` pointed at `http://backend:8080` | A browser cannot reach a Docker-internal hostname |
| The takeover call left out `supervisorId` | Takeover always returned 400 |
| Routes never broadcast changes | Nothing updated live |
| One simulator per WebSocket connection | Each open tab multiplied the fake traffic |
| Only the last WebSocket message was kept in React state | Events arriving together were dropped |
| The sidebar linked to routes that did not exist | Dead navigation |

Know three of these well enough to explain the cause, not only the symptom. The best three: the per-connection simulator, the dropped WebSocket messages, and the Docker hostname.

## 4. What was added and changed, folder by folder

Folders were later renamed to `backend/` and `frontend/`.

### Backend

| File | Status | What it does |
| --- | --- | --- |
| `server.js` | Changed | Mounts all routes, boots the database, seeds data, starts the simulator |
| `db.js` | New | Connects to MongoDB, falls back to an embedded MongoDB when Docker is absent |
| `routes/conversations.js` | Changed | Added search, risk sort, summary view, feedback, co-pilot |
| `routes/intervene.js` | Changed | Takeover and release, with the atomic release guard |
| `routes/agents.js` | Changed | Config validation, versioned deploy, evaluation, simulation |
| `routes/analytics.js` | Rewritten | Dashboard data and the SSE stream |
| `routes/templates.js` | New | Template CRUD, sanitising, server-side render |
| `routes/presets.js` | New | Preset list, create, delete, apply |
| `routes/system.js` | New | Activity feed, search, simulator switch, reset |
| `routes/vector.js` | New | Knowledge search endpoints from the contract |
| `services/conversationService.js` | New | Adds risk to conversations, records activity, broadcasts |
| `services/analytics.js` | New | Every dashboard number |
| `services/simulator.js` | New | One shared traffic simulator |
| `services/copilot.js` | New | Recommended action and reply for the supervisor |
| `services/evaluation.js` | New | Evaluation suite and simulation console |
| `utils/risk.js` | New | The single risk model |
| `utils/templateUtils.js` | New | Variable detection and substitution |
| `utils/seedData.js` | New | Sample dataset generated relative to the current time |
| `websocket/hub.js` | New | Keeps the client list and fans events out |
| `websocket/socketHandler.js` | Fixed | Sends a real snapshot on connect, heartbeat |
| `models/` | 3 new | `configPreset`, `activity`, `metricSnapshot` |

### Frontend

| File | Status | What it does |
| --- | --- | --- |
| `app.js` | Changed | Data router, lazy-loaded pages, providers |
| `theme.js` | Rewritten | Figma colours, radii, type sizes as tokens |
| `api/index.js` | Changed | One function per endpoint, error wrapping |
| `context/WebSocketContext.js` | Rewritten | Event bus with reconnect |
| `context/AppDataContext.js` | Rewritten | Live conversations, agents, actions |
| `context/SettingsContext.js` | New | Preferences in `localStorage` |
| `pages/Dashboard.js` | Rewritten | Dashboard and the SSE subscription |
| `pages/ConversationView.js` | Rewritten | Intervention screen |
| `pages/AgentConfig.js` | Rewritten | Draft, evaluate, review, deploy |
| `pages/Templates.js`, `pages/Settings.js` | New | Template library, preferences |
| `components/dashboard/*` | New | Six dashboard panels |
| `components/conversation/*` | New | Transcript, composer, co-pilot, intel, return modal |
| `components/agent/*` | New | Behaviour, performance, simulation, presets, deploy |
| `components/templates/*` | New | Library, card, editor, picker |
| `hooks/useSpeechRecognition.js` | New | Voice input |
| `local/*` | New, after submission | Runs the backend logic in the browser for the Vercel site |

### Testing

`testing/test-runner.js` is theirs and unchanged. `testing/run.js` is a small launcher that finds a Chrome that starts on this machine, then runs their file.

## 5. How it works: six flows to know cold

Be able to draw each of these on a whiteboard.

### Flow 1: Opening the dashboard

1. `Dashboard.js` calls `GET /api/analytics/dashboard`.
2. `services/analytics.js` loads open conversations, scores each with `risk.assess()`, and computes metrics, queue health and signals.
3. The page paints.
4. Two seconds later the page opens an `EventSource` on `/api/analytics/stream`.
5. The server pushes a `metrics` event every 2 seconds. The page replaces its numbers each time.
6. In parallel, the WebSocket keeps the queue rows current.

### Flow 2: A new customer message arrives

1. The simulator adds a message to a conversation in MongoDB.
2. It recalculates sentiment and calls `reassess()`.
3. It broadcasts `message_update`, `metrics_update` and `conversation_updated` through the hub.
4. `WebSocketContext` receives the frame and calls every handler subscribed to that type.
5. `AppDataContext` updates its conversation map. React re-renders the row.
6. If the alert level just became `high`, an `alert` event raises a toast.

### Flow 3: Takeover

1. The supervisor clicks Take over.
2. `POST /api/intervene` sets `humanIntervention.active = true` and `status = 'escalated'`, and adds a system line to the transcript.
3. The server broadcasts the change and records a feed event.
4. The simulator checks `humanIntervention.active` on its next tick and stops generating AI replies for that conversation.

### Flow 4: Return to AI

1. The supervisor writes guidance and clicks Return control.
2. `POST /api/intervene/release` runs one database command: find the conversation **where `active` is true** and set it to false.
3. If nothing matched, someone already released it. The server answers `409` and writes nothing.
4. If it matched, the server appends one handoff note and broadcasts.

### Flow 5: Using a template

1. The supervisor opens the picker from the reply box.
2. `conversationValues()` derives values from the case: name, order number, refund amount.
3. `renderTemplate()` replaces each `{{name}}` that has a value and reports the ones that do not.
4. Insert puts the text in the reply box. Any remaining `{{name}}` is highlighted.
5. `canSend` is false while any variable is unresolved.

### Flow 6: Deploying a configuration change

1. Slider changes are held in a draft object in React state. The server is untouched.
2. Run evals posts the draft to `/evaluate`. Simulation posts it to `/simulate`.
3. Review and deploy shows a diff of draft against live.
4. `PATCH /api/agents/:id/config` with a `changeRequest` validates ranges, saves, bumps the version, stores the previous config, and broadcasts `agent_update`.
5. The simulator reads the agent's new parameters on its next tick.

## 6. Concepts you must be able to explain

Each has a plain definition, how the project uses it, and the follow-up to expect.

### REST, WebSocket and SSE

- **REST:** the browser asks, the server answers, the connection ends. Used for loading data and for actions.
- **WebSocket:** one connection stays open and both sides can send at any time. Used for conversation events.
- **SSE (Server-Sent Events):** one connection stays open and only the server sends. The browser's `EventSource` reconnects by itself. Used for the 2-second metrics.
- **Follow-up: why both WebSocket and SSE?** The email asked for SSE specifically. It also fits: metrics are one-way and periodic, and `EventSource` gives reconnection for free. Conversation events were already on WebSocket per the contract.
- **Follow-up: why not poll?** Polling every 2 seconds opens a new request each time and wastes work when nothing changed.

### React state, context and hooks

- **State:** data a component remembers between renders. Changing it re-renders the component.
- **Context:** a way to share state with every component below a provider, without passing props down by hand.
- **Hook:** a function starting with `use` that gives a component state or side effects.
- Three contexts: `WebSocketContext` (the socket), `AppDataContext` (conversations, agents, actions), `SettingsContext` (preferences).
- **Follow-up: why not Redux?** Three small contexts cover it. Redux would add boilerplate without solving a problem this app has.

### The event bus

- The starter stored the last WebSocket message in state. React batches state updates, so two messages in the same tick left only the second.
- The fix: keep a `Map` of event type to a `Set` of handler functions. Each incoming frame calls every handler for its type directly. Nothing is lost.
- Components subscribe with `useSocketEvent('message_update', handler)`.

### MongoDB and Mongoose

- **MongoDB** stores documents (JSON-like objects) in collections, with no fixed table schema.
- **Mongoose** adds schemas, defaults and validation on top.
- A conversation is one document with its messages embedded as an array. Reading a conversation is one query.
- **Follow-up: when would embedding hurt?** Very long conversations approach the 16 MB document limit, and every message write rewrites part of a large document. At scale, messages move to their own collection.

### Race conditions and atomic updates

- A **race condition** is two requests reading the same state before either writes, so both act on stale data.
- The bug: two release requests both saw `active: true` and both appended a handoff note.
- An **atomic** operation is one the database performs as a single step that cannot be interleaved.
- The fix: `findOneAndUpdate({ id, 'humanIntervention.active': true }, { $set: { active: false } })`. The check and the write are one step. Only one request can match.
- **Follow-up: what does the loser get?** `409 Conflict`. The interface treats it as "already returned".

### The risk score

- Seven signals, each with a weight: sentiment 36, AI confidence 24, SLA exposure 16, explicit request for a human 12, policy exception 10, VIP 6, repeat contact 6.
- Their weighted sum goes through a **logistic function**, `100 / (1 + e^(-(raw - 28.4) / 17.4))`. It squeezes any number into 0 to 100 in an S shape, so the result reads as a probability.
- The midpoint and spread were fitted so the five cases in the design land near their designed scores.
- It is computed every time a conversation is read. It is never stored, so it cannot go stale.
- **Follow-up: is this machine learning?** No. It is a hand-weighted heuristic. With real outcome data you would fit the weights with logistic regression and validate them.

### Sanitising HTML

- Templates are rich text, stored as HTML. Rendering stored HTML is how cross-site scripting (XSS) happens: someone saves a `<script>` and it runs in another supervisor's browser.
- Two layers: the server strips script, style and iframe tags and inline event handlers before saving. The browser runs DOMPurify before rendering.

### Responsive layout

- Chakra takes values per breakpoint, for example `columns={{ base: 2, md: 3, xl: 5 }}`.
- The desktop values match the original design. Smaller breakpoints change columns, stacking and navigation.
- Below `md` the sidebar becomes a drawer.

### Code splitting

- `React.lazy()` loads a page's code only when its route is first visited. The dashboard loads fast; the template editor's code arrives when needed.

### CORS and the dev proxy

- Browsers block a page on one origin from calling another origin unless the server allows it. That rule is CORS.
- In development the React server proxies `/api` to the backend, so REST looks same-origin.
- The SSE stream bypasses the proxy because dev proxies buffer streams. It calls port 8080 directly, which works because the server enables CORS.

## 7. Decisions and trade-offs

| Decision | Alternative | Why this way | Cost |
| --- | --- | --- | --- |
| One risk function used everywhere | Each screen computes its own | Dashboard, conversation view and API can never disagree | Computed on every read |
| Compute risk on read | Store the score | Wait time changes every second, so a stored score is wrong immediately | CPU per request; fine for dozens of chats, not for thousands |
| WebSocket for events, SSE for metrics | One channel for both | Matches the contract and the email; each transport fits its job | Two connections per client |
| Event bus | `lastMessage` in state | No dropped events | Handlers run outside React's state model, so they need care |
| Atomic release | Read, check, then write | The only version that is correct under concurrency | None |
| Draft then deploy for config | Save on every slider move | A slip of the mouse should not change live AI behaviour | More interface |
| Variables as atomic chips in the editor | Plain text `{{name}}` | Cannot be half-deleted or misspelt | Custom Quill code |
| Block send on unresolved variables | Warn only | A customer must never receive `{{refund_amount}}` | One more step for the supervisor |
| Embedded MongoDB fallback | Require Docker | Runs with one command on any machine | An extra dependency |
| Currency as a setting | Hard-code one | The design showed ₹; the audience might expect $ | A conversion helper |
| Browser data layer for hosting | Host the backend | No server to pay for or keep awake | Logic is copied into the frontend and must be kept in sync |

## 8. The mid-session requirements

| Requirement | What it means | How it was handled | Hard part |
| --- | --- | --- | --- |
| Templates: `{{variable_name}}`, categories, share with team | A standard blank syntax, grouping, and a shared flag | One regex on both sides finds variables. `isShared` drives a My team tab | Keeping variables intact inside rich text |
| Fill variables, preview before sending | See the final message before the customer does | Fields pre-filled from the case, preview re-rendered per keystroke | Showing filled and unfilled clearly in a plain text box |
| Metrics every 2 seconds via SSE | Push, not poll, on a fixed beat | `/api/analytics/stream` with `setInterval`, cleaned up on disconnect | The open stream stopped the page reaching "network idle", which failed a UI test. The stream now opens after the first REST load |
| Mobile-responsive dashboard | Usable on a phone | Breakpoint layouts, drawer navigation | Keeping the desktop layout unchanged |
| Voice input | Dictate a reply | Web Speech API hook. Interim text shown beside the box, final phrases appended | Not overwriting what the supervisor is typing |
| Fix duplicate handoff notes | Repeated release wrote two notes | Atomic conditional update, `409` for the second | Recognising it as a race, not a UI double-click |

## 9. How to talk about using AI

Be direct. The interviewers know. What they are testing is whether you understand and own the result.

**What you did**

- Read the brief and decided the order of work.
- Connected the Figma file through the Figma MCP and managed its small request quota.
- Directed the build screen by screen and reported defects you found while testing.
- Asked for verification against the design, then tested the screens yourself.
- Asked for mobile responsiveness on the dashboard, then chose to leave the rest as designed.
- Deferred the ₹ or $ choice, which became a setting.
- Handled the mid-session email and re-prioritised.
- Chose to keep the UI frozen for the showcase.

**What Claude did**

- Wrote the code, including most of the backend logic.
- Proposed the architecture: single risk model, event bus, shared simulator.
- Ran the tests and the browser checks.

**How to say it**

> I used Claude Code as the implementer and I acted as the engineer in charge: scope, design source, testing, and decisions. I did not hand-write most of the code. I have since read it and can explain how each part works and why.

**What not to do**

- Do not claim you hand-wrote it.
- Do not say "the AI did it" when asked why something works. Explain the mechanism.
- If you do not know, say "I have not looked at that file closely; here is how I would find out."

## 10. Weak spots and what you would do next

Raise these yourself if asked "what would you improve?" It shows judgement.

| Weak spot | What you would do |
| --- | --- |
| No authentication; one hard-coded supervisor | Add login, roles, and per-supervisor audit trail |
| The WebSocket accepts anyone | Authenticate the handshake with a token |
| Only their end-to-end tests exist | Unit tests for `risk.js` and `templateUtils.js`, component tests for the composer |
| Docker path never run on this machine | Run `docker compose up` and fix anything found |
| Risk computed on every read | Cache per conversation, invalidate on change, or precompute in a worker |
| Simulator and hub live in one process | With several servers, events need a shared channel such as Redis pub/sub |
| Risk weights are hand-set | Fit them from real outcomes |
| Only the dashboard is responsive | Design mobile layouts for the other screens |
| Create React App is no longer maintained | Move to Vite |
| No TypeScript | Add types, starting with the API layer |
| Backend logic is copied into `frontend/src/local/engine/` | Share it as a package |
| Scope far beyond a 3-hour brief | In a real 3 hours: core screens first, then the twist, extras last |

## 11. Question bank with answers

### About the task

**What did the brief ask for?**
A supervisor console with a live dashboard, an intervention screen and an agent configuration screen, built on their backend to their Figma design, in 3 hours, plus a templates feature announced mid-way.

**Was the backend part of the task?**
Not in the original brief. It became necessary: the templates endpoint was missing, analytics was a stub, several defects blocked the frontend, and the email asked for an SSE endpoint and a server-side bug fix.

**What went beyond the brief?**
The risk model, co-pilot, evaluation suite, simulation console, versioned deploys, generated sample data, search, export, and the Settings page.

### Architecture

**Walk me through what happens when a customer sends a message.**
Use Flow 2 in section 5.

**How does the dashboard stay live?**
Two channels. WebSocket pushes each conversation change. SSE pushes recomputed metrics every 2 seconds.

**Why is the risk score not saved in the database?**
It depends on elapsed time, so any saved value is stale a second later. Only the alert level is saved, for filtering.

**How do the dashboard and conversation screen always agree on a score?**
Both get it from the same function, `assess()` in `backend/utils/risk.js`.

**What happens when the WebSocket drops?**
The client retries with exponential backoff, 1 second doubling up to 30. On reconnect it reloads conversations and agents over REST to catch up on anything missed.

**What does the server do when an SSE client disconnects?**
The request's `close` event clears the interval timer, so no work continues for a closed connection.

### Specific code

**How did you fix the duplicate handoff notes?**
One conditional database update: set `active` to false only where it is currently true. The first request matches and writes the note. The second matches nothing and gets a 409.

**Why not disable the button after one click?**
That only fixes one browser tab. Two tabs, a retry, or a direct API call would still duplicate. The guarantee has to be on the server.

**How do you find variables in a template?**
A regular expression, `\{\{\s*([a-zA-Z][\w]*)\s*\}\}`. It matches double braces around a name that starts with a letter. The same pattern runs on the server and in the browser.

**How are unfilled variables highlighted inside a plain text box?**
A text area cannot colour part of its text. A second layer sits behind it with the same text and font, where the variables are wrapped in a highlight. The text area on top has a transparent background.

**How does voice input work?**
The browser's `SpeechRecognition` API. It fires results marked interim or final. Interim text is shown beside the box. Final phrases are appended to the draft.

**What does "take over" change in the data?**
`humanIntervention.active` becomes true and `status` becomes `escalated`. The simulator checks that flag and stops AI replies.

**How does a config change affect the AI?**
The simulator reads each agent's saved parameters on every tick. Lower temperature raises the confidence it generates, which lowers fallbacks.

### Judgement

**What was the hardest bug?**
The SSE stream broke a UI test. The test waits for the network to go quiet, and an open stream never goes quiet. The page now loads over REST first and opens the stream at the first 2-second tick.

**What would break first at 10,000 live conversations?**
Scoring every conversation on every dashboard request, and sending the full list to each client. I would paginate, cache scores, and send deltas.

**What would you do differently?**
Write unit tests for the risk model first, use TypeScript, and build only the brief before any extras.

**Why Chakra UI?**
It came with the starter. Its style props and breakpoint syntax made matching Figma values and the responsive work direct.

**How did you use the Figma MCP?**
It lets the coding agent read the design file directly: layout, spacing, colours, and exported assets. The plan had a small quota, so I saved renders of all six screens and the icons once, pulled detailed specs for three screens, and matched the rest against the saved renders.

### About Zangoh's domain

**Why does an AI agent need a human supervisor?**
The AI is confident and wrong sometimes, has limits on what it may approve, and cannot repair an angry customer. A supervisor catches those cases early.

**What is containment?**
The share of conversations the AI resolves with no human. It is the main measure of how much work the AI is saving.

**What is an escalation threshold?**
A rule that forces a handover, such as sentiment below a level or a refund above a limit.

**Why evaluate a configuration before deploying it?**
A parameter change alters every live conversation. Running it against known scenarios first shows the effect before customers see it.

## 12. Ten files to read before the interview

Read each top to bottom once. Note one thing you could explain from each.

| # | File | Look for |
| --- | --- | --- |
| 1 | `backend/utils/risk.js` | The weights, the logistic line, how `alertLevel` and `action` are chosen |
| 2 | `backend/routes/intervene.js` | Takeover, and the `findOneAndUpdate` in release |
| 3 | `backend/routes/analytics.js` | The SSE handler: headers, `setInterval`, the `close` cleanup |
| 4 | `backend/websocket/hub.js` | `broadcast()` and the client `Set` |
| 5 | `backend/services/simulator.js` | `tick()`, `advance()`, the check for human takeover |
| 6 | `frontend/src/context/WebSocketContext.js` | `dispatch`, `subscribe`, reconnect delay |
| 7 | `frontend/src/context/AppDataContext.js` | How socket events update the conversation map |
| 8 | `frontend/src/pages/Dashboard.js` | The `EventSource` effect and its cleanup |
| 9 | `frontend/src/components/conversation/ReplyComposer.js` | The highlight layer and `canSend` |
| 10 | `frontend/src/hooks/useSpeechRecognition.js` | `onresult`, interim against final |

Then open the live site and do one full pass: take over, insert a template, return to AI, deploy a preset.

## 13. Numbers to remember

| Item | Value |
| --- | --- |
| Automated checks | 14 of 14: 8 API, 2 WebSocket, 4 UI |
| Metrics stream | Every 2 seconds |
| Simulator tick | Every 6 seconds |
| SLA target | 15 minutes |
| Alert level high | Score 80 or more, or two threshold breaches, or the customer asked for a human |
| Alert level medium | Score 60 or more, or one breach |
| Take over recommended | Score 90 or more, or the customer asked for a human |
| WebSocket heartbeat | Ping every 30 seconds |
| Reconnect backoff | 1 second doubling to a 30 second cap |
| Sample data | 24 live conversations, 96 resolved, 5 agents, 24 templates, 3 presets |
| Screens in Figma | 6 |
| Stack versions | React 18, Chakra UI 2, React Router 6, Express 4, Mongoose 7 |

## 14. One-day plan

| Block | Do |
| --- | --- |
| 1 hour | Read sections 1 to 5. Say the pitch aloud three times |
| 2 hours | Read the ten files in section 12 with this guide open |
| 1 hour | Draw the six flows from memory. Check against section 5 |
| 1 hour | Answer the question bank aloud without looking. Mark the ones you miss |
| 30 minutes | Use the live site end to end. Open the repo and be able to find any file in under ten seconds |
| 30 minutes | Sections 9 and 10. Decide your answers to "how did you use AI" and "what would you improve" |
| Before the call | Run the app locally once so a live demo does not surprise you |
