#!/usr/bin/env node
// Copies the backend's pure decision logic (risk model, co-pilot, evaluation suite, mock model,
// template rendering, seed dataset) into the frontend so the browser data source runs the same
// code as the API. Run after changing any of the source files: `npm run sync:engine`.
const fs = require('fs');
const path = require('path');

const backend = path.join(__dirname, '..', 'backend');
const out = path.join(__dirname, '..', 'frontend', 'src', 'local', 'engine');

const FILES = {
  'utils/risk.js': 'risk.js',
  'utils/money.js': 'money.js',
  'utils/templateUtils.js': 'templateUtils.js',
  'utils/seedData.js': 'seedData.js',
  'mockLlmApi.js': 'mockLlm.js',
  'services/copilot.js': 'copilot.js',
  'services/evaluation.js': 'evaluation.js'
};

const REWRITES = [
  [/require\('\.\.\/utils\/(\w+)'\)/g, "require('./$1')"],
  [/require\('\.\.\/mockLlmApi'\)/g, "require('./mockLlm')"],
  // The mock model also exposes HTTP routes on the server; the browser only needs its functions
  [/const express = require\('express'\);/, 'const express = { Router: () => ({ get() {}, post() {} }) };'],
  [/const \{ simulateDelay \} = require\('\.\/utils\/helpers'\);/, 'const simulateDelay = () => Promise.resolve();']
];

fs.mkdirSync(out, { recursive: true });
Object.entries(FILES).forEach(([from, to]) => {
  let source = fs.readFileSync(path.join(backend, from), 'utf8');
  REWRITES.forEach(([pattern, replacement]) => { source = source.replace(pattern, replacement); });
  const header = `/* eslint-disable */\n// Generated from backend/${from} by scripts/sync-engine.js. Do not edit here.\n`;
  fs.writeFileSync(path.join(out, to), header + source);
  console.log(`engine/${to}  <-  backend/${from}`);
});
