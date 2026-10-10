// db.js
// Connects to MongoDB (Docker in the official setup). For local development without Docker,
// USE_MEMORY_DB=true — or a failed connection outside production — starts an embedded MongoDB
// persisted under ./.data so the workstation runs with a single `npm run dev`.
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

let memoryServer = null;

const EMBEDDED_PORT = Number(process.env.EMBEDDED_MONGO_PORT || 27018);

// An embedded instance left running by a previous process (crash, hard restart) is reused
async function existingEmbedded() {
  const uri = `mongodb://127.0.0.1:${EMBEDDED_PORT}/supervisor`;
  const probe = mongoose.createConnection(uri, { serverSelectionTimeoutMS: 1500 });
  try {
    await probe.asPromise();
    return uri;
  } catch {
    return null;
  } finally {
    await probe.close().catch(() => {});
  }
}

async function startEmbedded() {
  const running = await existingEmbedded();
  if (running) {
    console.log(`[db] reusing embedded MongoDB at ${running}`);
    return running;
  }
  const { MongoMemoryServer } = require('mongodb-memory-server');
  const dbPath = path.join(__dirname, '.data', 'mongo');
  fs.mkdirSync(dbPath, { recursive: true });
  memoryServer = await MongoMemoryServer.create({ instance: { dbPath, storageEngine: 'wiredTiger', port: EMBEDDED_PORT } });
  const uri = memoryServer.getUri('supervisor');
  console.log(`[db] embedded MongoDB at ${uri} (data in ${dbPath})`);
  return uri;
}

async function connect() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/supervisor';
  if (process.env.USE_MEMORY_DB === 'true') {
    await mongoose.connect(await startEmbedded());
    return;
  }
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 4000 });
    console.log(`[db] connected to ${uri}`);
  } catch (err) {
    if (process.env.NODE_ENV === 'production') throw err;
    console.warn(`[db] ${uri} unreachable (${err.message}); falling back to embedded MongoDB`);
    await mongoose.disconnect().catch(() => {});
    await mongoose.connect(await startEmbedded());
  }
}

async function close() {
  await mongoose.connection.close();
  if (memoryServer) await memoryServer.stop({ doCleanup: false });
}

module.exports = { connect, close };
