#!/usr/bin/env node
/**
 * mem0.js — Scout memory layer via mem0 REST API
 *
 * Usage:
 *   node mem0.js add  "<text>" [--type=<type>] [--keyword=<keyword>]
 *   node mem0.js search "<query>" [--limit=5]
 *   node mem0.js list  [--limit=20]
 *
 * Types: formula, pipeline, qa, market, ingredient, infrastructure, status
 *
 * Programmatic (require):
 *   const mem0 = require('./mem0');
 *   await mem0.add("text", { type: "formula", keyword: "biotin gummies" });
 *   await mem0.search("biotin clinical dose");
 */

require('dotenv').config();
const fetch = require('node-fetch');

const API_KEY = process.env.MEM0_API_KEY;
const BASE_URL = 'https://api.mem0.ai/v1';
const USER_ID = 'scout';

if (!API_KEY) {
  console.error('MEM0_API_KEY not set in .env');
  process.exit(1);
}

const headers = {
  'Authorization': `Token ${API_KEY}`,
  'Content-Type': 'application/json'
};

async function add(text, meta = {}) {
  const body = {
    messages: [{ role: 'user', content: text }],
    user_id: USER_ID,
    metadata: meta
  };
  const res = await fetch(`${BASE_URL}/memories/`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`mem0 add failed: ${res.status} ${err}`);
  }
  return res.json();
}

async function search(query, limit = 5) {
  const body = { query, user_id: USER_ID, limit };
  const res = await fetch(`${BASE_URL}/memories/search/`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`mem0 search failed: ${res.status} ${err}`);
  }
  return res.json();
}

async function list(limit = 20) {
  const res = await fetch(`${BASE_URL}/memories/?user_id=${USER_ID}&limit=${limit}`, {
    headers
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`mem0 list failed: ${res.status} ${err}`);
  }
  return res.json();
}

// CLI
if (require.main === module) {
  const [,, command, ...rest] = process.argv;

  const flags = {};
  const args = rest.filter(a => {
    const m = a.match(/^--(\w+)=(.+)$/);
    if (m) { flags[m[1]] = m[2]; return false; }
    return true;
  });

  (async () => {
    try {
      if (command === 'add') {
        const text = args[0];
        if (!text) { console.error('Usage: node mem0.js add "<text>" [--type=X] [--keyword=X]'); process.exit(1); }
        const result = await add(text, flags);
        console.log('Stored:', JSON.stringify(result, null, 2));

      } else if (command === 'search') {
        const query = args[0];
        if (!query) { console.error('Usage: node mem0.js search "<query>" [--limit=5]'); process.exit(1); }
        const results = await search(query, parseInt(flags.limit || 5));
        const memories = results.results || results;
        if (!memories.length) { console.log('No results.'); return; }
        memories.forEach((m, i) => {
          console.log(`\n[${i + 1}] score=${m.score?.toFixed(3) ?? 'n/a'}`);
          console.log(`    ${m.memory}`);
          if (m.metadata && Object.keys(m.metadata).length) console.log(`    meta: ${JSON.stringify(m.metadata)}`);
        });

      } else if (command === 'list') {
        const results = await list(parseInt(flags.limit || 20));
        const memories = results.results || results;
        if (!memories.length) { console.log('No memories stored.'); return; }
        memories.forEach((m, i) => {
          console.log(`\n[${i + 1}] ${m.memory}`);
          if (m.metadata && Object.keys(m.metadata).length) console.log(`    meta: ${JSON.stringify(m.metadata)}`);
        });

      } else {
        console.error('Commands: add, search, list');
        process.exit(1);
      }
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
  })();
}

module.exports = { add, search, list };
