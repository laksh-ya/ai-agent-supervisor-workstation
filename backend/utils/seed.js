// utils/seed.js
// `npm run seed` resets the database to the demo dataset. The server also calls
// ensureSeeded() on boot so a fresh database is populated automatically.
const mongoose = require('mongoose');
const dotenv = require('dotenv');

const Conversation = require('../models/conversation');
const Agent = require('../models/agent');
const KnowledgeBase = require('../models/knowledgeBase');
const ResponseTemplate = require('../models/responseTemplate');
const ConfigPreset = require('../models/configPreset');
const Activity = require('../models/activity');
const MetricSnapshot = require('../models/metricSnapshot');
const { SEED_VERSION, buildSeed } = require('./seedData');
const { assess } = require('./risk');

async function seedDatabase({ log = console.log } = {}) {
  const now = Date.now();
  const data = buildSeed(now);

  // Store alert levels consistent with the risk model so API filters work immediately
  const agents = new Map(data.agents.map((a) => [a.id, a]));
  data.conversations.forEach((c) => {
    if (c.status === 'resolved') return;
    const risk = assess(c, agents.get(c.agent.id));
    c.alertLevel = risk.alertLevel;
    c.alertReasons = risk.breaches;
    if (risk.alertLevel === 'high' && risk.breaches.length && c.status === 'active' && c.tags.includes('escalation-requested')) c.status = 'escalated';
  });

  await Promise.all([
    Conversation.deleteMany({}), Agent.deleteMany({}), KnowledgeBase.deleteMany({}),
    ResponseTemplate.deleteMany({}), ConfigPreset.deleteMany({}), Activity.deleteMany({}), MetricSnapshot.deleteMany({})
  ]);

  await Agent.insertMany(data.agents);
  await KnowledgeBase.insertMany(data.knowledgeBases);
  await Conversation.insertMany(data.conversations);
  await ResponseTemplate.insertMany(data.templates, { timestamps: false });
  await ConfigPreset.insertMany(data.presets);
  await Activity.insertMany(data.activities);
  await MetricSnapshot.insertMany(data.snapshots);

  await mongoose.connection.db.collection('meta').updateOne(
    { _id: 'seed' },
    { $set: { version: SEED_VERSION, seededAt: new Date(now) } },
    { upsert: true }
  );

  log(`[seed] v${SEED_VERSION}: ${data.conversations.length} conversations, ${data.agents.length} agents, ${data.templates.length} templates, ${data.presets.length} presets`);
}

async function ensureSeeded() {
  const meta = await mongoose.connection.db.collection('meta').findOne({ _id: 'seed' });
  if (!meta || meta.version < SEED_VERSION) {
    await seedDatabase();
    return true;
  }
  return false;
}

// Demo data is timestamped relative to seeding. After a long pause the SLA clocks would all
// read "breached hours ago", so shift the whole timeline forward to keep the floor live.
async function rebaseTimelineIfStale() {
  const latest = await Conversation.findOne({ status: { $ne: 'resolved' } }).sort({ updatedAt: -1 }).lean();
  if (!latest) return;
  const lastMessage = (latest.messages || []).at(-1);
  const lastActivity = new Date(lastMessage?.timestamp || latest.startTime).getTime();
  const staleness = Date.now() - lastActivity;
  if (staleness < 30 * 60000) return;
  const shift = staleness - 60000;
  const move = (d) => (d ? new Date(new Date(d).getTime() + shift) : d);

  const conversations = await Conversation.find();
  for (const c of conversations) {
    c.startTime = move(c.startTime);
    if (c.endTime) c.endTime = move(c.endTime);
    c.messages.forEach((m) => { m.timestamp = move(m.timestamp); });
    if (c.humanIntervention?.timestamp) c.humanIntervention.timestamp = move(c.humanIntervention.timestamp);
    if (c.humanIntervention?.releasedAt) c.humanIntervention.releasedAt = move(c.humanIntervention.releasedAt);
    await c.save();
  }
  await Activity.updateMany({}, [{ $set: { timestamp: { $add: ['$timestamp', shift] } } }]);
  await MetricSnapshot.updateMany({}, [{ $set: { timestamp: { $add: ['$timestamp', shift] } } }]);
  console.log(`[seed] timeline rebased forward by ${Math.round(shift / 60000)} min`);
}

module.exports = { seedDatabase, ensureSeeded, rebaseTimelineIfStale };

if (require.main === module) {
  dotenv.config();
  const db = require('../db');
  db.connect()
    .then(() => seedDatabase())
    .catch((err) => { console.error('Error seeding database:', err); process.exitCode = 1; })
    .finally(() => db.close());
}
