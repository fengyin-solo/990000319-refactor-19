const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  isValidHttpUrl,
  normalizeTags,
  normalizeReviewDate,
  insertLinkTags,
  replaceLinkTags,
  fetchLinkWithTags,
} = require('../utils/link-utils');

test('isValidHttpUrl 只接受 http/https 地址', () => {
  assert.equal(isValidHttpUrl('https://example.com'), true);
  assert.equal(isValidHttpUrl('http://example.com/path?q=1'), true);
  assert.equal(isValidHttpUrl('  https://example.com  '), true);
  assert.equal(isValidHttpUrl('ftp://example.com'), false);
  assert.equal(isValidHttpUrl('javascript:alert(1)'), false);
  assert.equal(isValidHttpUrl('example.com'), false);
  assert.equal(isValidHttpUrl(''), false);
  assert.equal(isValidHttpUrl(null), false);
});

test('normalizeTags 按中英文逗号拆分、去空、去重', () => {
  assert.deepEqual(normalizeTags(['前端', 'Vue']), ['前端', 'Vue']);
  assert.deepEqual(normalizeTags('前端，Vue,教程'), ['前端', 'Vue', '教程']);
  assert.deepEqual(normalizeTags(['a', '', '  ', null, undefined, 5, 'a', 'b']), ['a', 'b']);
  assert.deepEqual(normalizeTags([]), []);
  assert.deepEqual(normalizeTags(null), []);
  assert.deepEqual(normalizeTags(undefined), []);
});

test('normalizeReviewDate 归一为 YYYY-MM-DD 或 null', () => {
  assert.equal(normalizeReviewDate('2026-09-17'), '2026-09-17');
  assert.equal(normalizeReviewDate('2026-09-17T16:00:00.000Z'), '2026-09-17');
  assert.equal(normalizeReviewDate(null), null);
  assert.equal(normalizeReviewDate(undefined), null);
  assert.equal(normalizeReviewDate(''), null);
  assert.equal(normalizeReviewDate('garbage'), null);
});

// 用内存数据库检查标签写入/读取的往返
function createTestDb() {
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#409EFF'
    );
    CREATE TABLE links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      category_id INTEGER,
      status TEXT DEFAULT 'unchecked',
      is_read_later INTEGER DEFAULT 0,
      review_date DATETIME,
      review_status TEXT DEFAULT 'pending'
    );
    CREATE TABLE link_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      link_id INTEGER NOT NULL,
      tag TEXT NOT NULL
    );
  `);
  return db;
}

test('insertLinkTags 写库后无空标签', () => {
  const db = createTestDb();
  const linkId = db
    .prepare('INSERT INTO links (user_id, url, title) VALUES (?, ?, ?)')
    .run(1, 'https://example.com', '示例').lastInsertRowid;

  insertLinkTags(db, linkId, ['前端', '', '  ', 'Vue', '前端', null]);

  const link = fetchLinkWithTags(db, linkId);
  assert.deepEqual(link.tags, ['前端', 'Vue']);
  db.close();
});

test('replaceLinkTags 全量替换，已有数据保存后标签干净', () => {
  const db = createTestDb();
  const linkId = db
    .prepare('INSERT INTO links (user_id, url, title) VALUES (?, ?, ?)')
    .run(1, 'https://example.com', '示例').lastInsertRowid;

  insertLinkTags(db, linkId, ['旧标签']);
  // 模拟编辑保存：字符串输入（含中文逗号）全量替换
  replaceLinkTags(db, linkId, '文档, 教程，文档');

  const link = fetchLinkWithTags(db, linkId);
  assert.deepEqual(link.tags, ['文档', '教程']);
  db.close();
});

test('fetchLinkWithTags 带出分类信息', () => {
  const db = createTestDb();
  const catId = db
    .prepare('INSERT INTO categories (user_id, name, color) VALUES (?, ?, ?)')
    .run(1, 'Development', '#409EFF').lastInsertRowid;
  const linkId = db
    .prepare('INSERT INTO links (user_id, url, title, category_id) VALUES (?, ?, ?, ?)')
    .run(1, 'https://example.com', '示例', catId).lastInsertRowid;

  const link = fetchLinkWithTags(db, linkId);
  assert.equal(link.category_name, 'Development');
  assert.equal(link.category_color, '#409EFF');
  assert.deepEqual(link.tags, []);
  db.close();
});
