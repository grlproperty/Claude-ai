/**
 * One SQLite file per business. The file is stamped with the business id on
 * creation and refuses to open under any other id, so a misconfigured path
 * cannot silently join two companies' records.
 */
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS counters(prefix TEXT PRIMARY KEY, n INTEGER);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT, updated_at TEXT, updated_by TEXT);
CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY, type TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT, updated_at TEXT);
CREATE INDEX IF NOT EXISTS records_type ON records(type);
CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, title TEXT, detail TEXT, agent_id TEXT, status TEXT, priority INTEGER, due TEXT,
  run_id TEXT, created_by TEXT, result TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS approvals(id TEXT PRIMARY KEY, level TEXT, action TEXT, title TEXT, payload TEXT, requested_by TEXT,
  status TEXT, decided_by TEXT, decided_at TEXT, note TEXT, run_id TEXT, step_id TEXT, dispatch TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY, workflow_id TEXT, status TEXT, input TEXT, state TEXT, next_step INTEGER,
  started_at TEXT, finished_at TEXT, error TEXT);
CREATE TABLE IF NOT EXISTS run_steps(run_id TEXT, idx INTEGER, step_id TEXT, name TEXT, agent_id TEXT, status TEXT, output TEXT, error TEXT, at TEXT);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, actor TEXT, action TEXT, target TEXT, detail TEXT);
CREATE TABLE IF NOT EXISTS usage(id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, agent_id TEXT, model TEXT, input_tokens INTEGER, output_tokens INTEGER, cache_read INTEGER);
CREATE VIRTUAL TABLE IF NOT EXISTS kb USING fts5(path UNINDEXED, title, body, folder UNINDEXED, owner UNINDEXED, version UNINDEXED, status UNINDEXED, access UNINDEXED, source UNINDEXED, updated UNINDEXED);
`;

const J = (v) => JSON.stringify(v ?? null);
const P = (s) => (s == null ? null : JSON.parse(s));

export function openDb(tenant, clock = () => new Date()) {
  const sql = new DatabaseSync(tenant.data('aios.db'));
  sql.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
  sql.exec(SCHEMA);
  const stamp = sql.prepare("SELECT value FROM meta WHERE key='tenant'").get();
  if (!stamp) sql.prepare("INSERT INTO meta VALUES('tenant', ?)").run(tenant.id);
  else if (stamp.value !== tenant.id) {
    sql.close();
    throw new Error(`Isolation violation: database belongs to "${stamp.value}", not "${tenant.id}"`);
  }
  const now = () => clock().toISOString();
  const q = (s) => sql.prepare(s);
  const nextId = (prefix) => {
    q('INSERT INTO counters VALUES(?,1) ON CONFLICT(prefix) DO UPDATE SET n=n+1').run(prefix);
    return `${prefix}-${String(q('SELECT n FROM counters WHERE prefix=?').get(prefix).n).padStart(4, '0')}`;
  };
  const row = (r, ...json) => { if (!r) return null; const o = { ...r }; for (const k of json) o[k] = P(o[k]); return o; };

  const db = {
    sql, now, nextId,
    close: () => sql.close(),
    audit(actor, action, target = '', detail = null) {
      q('INSERT INTO audit(at,actor,action,target,detail) VALUES(?,?,?,?,?)').run(now(), actor, action, String(target), J(detail));
    },
    auditLog: (limit = 200, since = '') => q('SELECT * FROM audit WHERE at>=? ORDER BY id DESC LIMIT ?').all(since, limit).map((r) => row(r, 'detail')),
    // settings (targets and other owner-editable configuration)
    getSetting(key, fallback) { const r = q('SELECT value FROM settings WHERE key=?').get(key); return r ? P(r.value) : fallback; },
    setSetting(key, value, by) {
      q('INSERT INTO settings VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at, updated_by=excluded.updated_by').run(key, J(value), now(), by);
      db.audit(by, 'setting.changed', key, value);
    },
    // generic business records
    put(type, data, id) {
      id = id || data.id || nextId(type.slice(0, 3).toUpperCase());
      const t = now();
      q('INSERT INTO records VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at').run(id, type, J({ ...data, id }), t, t);
      return { ...data, id };
    },
    get: (id) => { const r = q('SELECT data FROM records WHERE id=?').get(id); return r ? P(r.data) : null; },
    list: (type) => q('SELECT data, created_at, updated_at FROM records WHERE type=? ORDER BY created_at').all(type).map((r) => ({ ...P(r.data), _created: r.created_at, _updated: r.updated_at })),
    update(id, patch) { const cur = db.get(id); if (!cur) throw new Error(`No record ${id}`); const type = q('SELECT type FROM records WHERE id=?').get(id).type; return db.put(type, { ...cur, ...patch }, id); },
    // tasks
    addTask({ title, detail = '', agent, priority = 3, due = null, runId = null, by = 'orchestrator' }) {
      const id = nextId('T'); const t = now();
      q('INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id, title, detail, agent, 'open', priority, due, runId, by, null, t, t);
      db.audit(by, 'task.created', id, { title, agent });
      return id;
    },
    setTask(id, status, result = null, by = 'owner') {
      q('UPDATE tasks SET status=?, result=?, updated_at=? WHERE id=?').run(status, J(result), now(), id);
      db.audit(by, `task.${status}`, id);
    },
    tasks: (where = '1=1', ...args) => q(`SELECT * FROM tasks WHERE ${where} ORDER BY priority, created_at`).all(...args).map((r) => row(r, 'result')),
    // approvals
    approvals: (where = '1=1', ...args) => q(`SELECT * FROM approvals WHERE ${where} ORDER BY created_at DESC`).all(...args).map((r) => row(r, 'payload', 'dispatch')),
    approval: (id) => row(q('SELECT * FROM approvals WHERE id=?').get(id), 'payload', 'dispatch'),
    // runs
    run: (id) => row(q('SELECT * FROM runs WHERE id=?').get(id), 'input', 'state'),
    runs: (limit = 50) => q('SELECT * FROM runs ORDER BY started_at DESC LIMIT ?').all(limit).map((r) => row(r, 'input', 'state')),
    runSteps: (id) => q('SELECT * FROM run_steps WHERE run_id=? ORDER BY idx, at').all(id).map((r) => row(r, 'output')),
    J, P, q,
  };
  return db;
}
