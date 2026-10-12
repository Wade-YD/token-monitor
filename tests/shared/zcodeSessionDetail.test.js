'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const nodeSqlite = require('node:sqlite');

const { readSessionDetail } = require('../../src/shared/sessionDetail');

const tmpDirs = [];
test.after(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

const T0 = Date.UTC(2026, 8, 16, 14, 0, 0);
const T1 = Date.UTC(2026, 8, 16, 14, 0, 6);
const T2 = Date.UTC(2026, 8, 16, 14, 1, 0);
const T3 = Date.UTC(2026, 8, 16, 14, 1, 8);
const END = T3 + 1000;

function makeFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-monitor-zcode-detail-'));
  tmpDirs.push(dir);
  const file = path.join(dir, 'db.sqlite');
  const db = new DatabaseSync(file);
  db.exec('CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT, time_created INTEGER, time_updated INTEGER, data TEXT, sequence INTEGER)');
  db.exec('CREATE TABLE part (id TEXT PRIMARY KEY, message_id TEXT, session_id TEXT, time_created INTEGER, time_updated INTEGER, data TEXT, sequence INTEGER)');
  const insM = db.prepare('INSERT INTO message (id, session_id, time_created, time_updated, data, sequence) VALUES (?,?,?,?,?,?)');
  const asst = (tokens) => JSON.stringify({ role: 'assistant', cost: 0, tokens, time: { created: null } });
  insM.run('m0', 's1', T0, T0, JSON.stringify({ role: 'user', time: { created: T0 } }), 1);
  insM.run('m1', 's1', T1, T1, asst({ total: 300, input: 200, output: 100, reasoning: 20, cache: { read: 0, write: 0 } }), 2);
  insM.run('m2', 's1', T2, T2, JSON.stringify({ role: 'user', time: { created: T2 } }), 3);
  insM.run('m3', 's1', T3, T3, asst({ total: 100, input: 60, output: 30, reasoning: 0, cache: { read: 10, write: 0 } }), 4);
  const insP = db.prepare('INSERT INTO part (id, message_id, session_id, time_created, time_updated, data, sequence) VALUES (?,?,?,?,?,?,?)');
  insP.run('p0', 'm0', 's1', T0, T0, JSON.stringify({ type: 'text', text: '帮我查一下配置' }));
  insP.run('p1', 'm1', 's1', T1, T1, JSON.stringify({ type: 'tool', tool: 'Bash' }));
  insP.run('p2', 'm2', 's1', T2, T2, JSON.stringify({ type: 'text', text: '再看一遍日志' }));
  db.close();
  return file;
}

test('readSessionDetail(zcode) groups exchanges with prompt previews and tools', (t) => {
  const file = makeFixture();
  const detail = readSessionDetail({
    client: 'zcode', sessionId: 's1', period: 'total', sessionCost: 1,
    home: os.tmpdir(), deps: { zcodeDeps: { dbPath: file, sqlite: nodeSqlite }, now: () => END }
  });
  assert.equal(detail.found, true);
  assert.equal(detail.exchanges.length, 2);

  const [ex1, ex2] = detail.exchanges;
  assert.equal(ex1.promptPreview, '帮我查一下配置');
  assert.equal(ex1.turnCount, 1);
  assert.equal(ex1.tokens.total, 300);
  assert.deepEqual(ex1.turns[0].tools, ['Bash']);

  assert.equal(ex2.promptPreview, '再看一遍日志');
  assert.equal(ex2.turnCount, 1);
  assert.equal(ex2.tokens.total, 100);
});

test('readSessionDetail(zcode) distributes the estimated session cost across turns', (t) => {
  const file = makeFixture();
  const detail = readSessionDetail({
    client: 'zcode', sessionId: 's1', period: 'total', sessionCost: 1,
    home: os.tmpdir(), deps: { zcodeDeps: { dbPath: file, sqlite: nodeSqlite }, now: () => END }
  });
  assert.equal(detail.totals.costUsd, 1);
  const costSum = detail.exchanges.reduce((acc, ex) => acc + ex.costEstimate, 0);
  assert.ok(Math.abs(costSum - 1) < 1e-9, 'distributed costs must sum to the session estimate');
  // 300:100 token split -> 0.75 / 0.25
  assert.ok(Math.abs(detail.exchanges[0].costEstimate - 0.75) < 1e-9);
  assert.ok(Math.abs(detail.exchanges[1].costEstimate - 0.25) < 1e-9);
});

test('readSessionDetail(zcode) reports found:false for an unknown session', (t) => {
  const file = makeFixture();
  const detail = readSessionDetail({
    client: 'zcode', sessionId: 'sess_nope', period: 'total',
    home: os.tmpdir(), deps: { zcodeDeps: { dbPath: file, sqlite: nodeSqlite }, now: () => END }
  });
  assert.equal(detail.found, false);
  assert.equal(detail.exchanges.length, 0);
});

test('readSessionDetail(zcode) degrades when the database is missing or corrupt', (t) => {
  const missing = readSessionDetail({
    client: 'zcode', sessionId: 's1', period: 'total',
    home: os.tmpdir(), deps: { zcodeDeps: { dbPath: path.join(os.tmpdir(), 'nope', 'db.sqlite'), sqlite: nodeSqlite } }
  });
  assert.equal(missing.found, false);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-monitor-zcode-detail-bad-'));
  tmpDirs.push(dir);
  const bad = path.join(dir, 'db.sqlite');
  fs.writeFileSync(bad, 'not a database');
  const corrupt = readSessionDetail({
    client: 'zcode', sessionId: 's1', period: 'total',
    home: os.tmpdir(), deps: { zcodeDeps: { dbPath: bad, sqlite: nodeSqlite } }
  });
  assert.equal(corrupt.found, false);
});

test('the renderer whitelists zcode in both detail gates', () => {
  // v0.69 moved the client whitelist behind sessionRows.sessionRowDetailAvailable;
  // app.js gates on that helper and the keydown handler still names zcode directly.
  const app = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'electron', 'renderer', 'app.js'),
    'utf8'
  );
  assert.match(app, /sessionRowsApi\.sessionRowDetailAvailable\(\{ client, sessionDetailAvailable \}\)/);
  assert.match(app, /client !== 'zcode'\) return;/);
  const sessionRows = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'electron', 'renderer', 'sessionRows.js'),
    'utf8'
  );
  assert.match(sessionRows, /\['claude',[^\]]*'zcode'\]\.includes\(row\?\.client\)/);
});
