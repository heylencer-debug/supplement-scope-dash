// A supabase-js stand-in that RECORDS every chained call per query, so a test
// can assert the exact table / select / filters / order / limit a read issues.
// Responses come from `respond(table, calls)` (default: empty result). No network.
'use strict';

const CHAIN = [
  'select', 'eq', 'neq', 'not', 'is', 'in', 'lt', 'lte', 'gt', 'gte', 'ilike', 'like', 'or',
  'order', 'limit', 'range', 'maybeSingle', 'single',
  'insert', 'update', 'upsert', 'delete',
];

function recordingSupabase(respond = () => ({ data: [], error: null })) {
  const queries = [];
  function from(table) {
    const q = { table, calls: [] };
    queries.push(q);
    const builder = {};
    for (const m of CHAIN) {
      builder[m] = (...args) => { q.calls.push([m, ...args]); return builder; };
    }
    builder.then = (resolve, reject) => Promise.resolve()
      .then(() => respond(table, q.calls) || { data: null, error: null })
      .then(resolve, reject);
    return builder;
  }
  return {
    from,
    queries,
    /** the recorded calls of every query on `table`, in issue order */
    callsOn: (table) => queries.filter((q) => q.table === table).map((q) => q.calls),
    tables: () => queries.map((q) => q.table),
    writes: () => queries.filter((q) => q.calls.some(([m]) => ['insert', 'update', 'upsert', 'delete'].includes(m))),
  };
}

module.exports = { recordingSupabase };
