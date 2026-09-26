// Minimal in-memory stand-in for the supabase-js query builder — only the
// chains P3b and the synthesis store use. No network.
'use strict';

function fakeSupabase(tables = {}, { missing = [] } = {}) {
  const calls = { upserts: [], updates: [], reads: [] };
  class Query {
    constructor(name) { this.name = name; this.filters = []; this.op = 'select'; this._order = null; this._limit = null; this._range = null; }
    select() { return this; }
    eq(c, v) { this.filters.push((r) => r[c] === v); return this; }
    in(c, vs) { this.filters.push((r) => vs.includes(r[c])); return this; }
    gte(c, v) { this.filters.push((r) => (r[c] || '') >= v); return this; }
    or(expr) {
      const vals = [...expr.matchAll(/keyword\.ilike\.("(?:[^"\\]|\\.)*")/g)].map((m) => JSON.parse(m[1]).toLowerCase());
      this.filters.push((r) => vals.includes(String(r.keyword || '').toLowerCase()));
      return this;
    }
    order(c, { ascending = true } = {}) { this._order = [c, ascending]; return this; }
    limit(n) { this._limit = n; return this; }
    range(a, b) { this._range = [a, b]; return this; }
    upsert(rows) { this.op = 'upsert'; this.payload = rows; return this; }
    update(obj) { this.op = 'update'; this.payload = obj; return this; }
    then(resolve, reject) { return Promise.resolve().then(() => this.exec()).then(resolve, reject); }
    exec() {
      if (missing.includes(this.name)) return { data: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${this.name}' in the schema cache` } };
      const t = (tables[this.name] = tables[this.name] || []);
      if (this.op === 'upsert') {
        for (const r of this.payload) {
          calls.upserts.push(r);
          const i = t.findIndex((x) => x.keyword === r.keyword && x.scope === r.scope && (x.asin || '') === (r.asin || ''));
          if (i >= 0) t[i] = { ...r }; else t.push({ ...r });
        }
        return { data: null, error: null };
      }
      let rows = t.filter((r) => this.filters.every((f) => f(r)));
      if (this.op === 'update') {
        calls.updates.push({ table: this.name, payload: this.payload, count: rows.length });
        rows.forEach((r) => Object.assign(r, this.payload));
        return { data: null, error: null };
      }
      calls.reads.push(this.name);
      if (this._order) {
        const [c, asc] = this._order;
        rows = [...rows].sort((a, b) => ((a[c] > b[c]) - (a[c] < b[c])) * (asc ? 1 : -1));
      }
      if (this._range) rows = rows.slice(this._range[0], this._range[1] + 1);
      if (this._limit != null) rows = rows.slice(0, this._limit);
      return { data: rows.map((r) => ({ ...r })), error: null };
    }
  }
  return { from: (name) => new Query(name), tables, calls };
}

module.exports = { fakeSupabase };
