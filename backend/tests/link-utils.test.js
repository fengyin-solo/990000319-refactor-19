const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { normalizeTags, isValidUrl, replaceLinkTags, getLinkWithTags } = require('../utils/link-utils');

test('normalizeTags 去空白、去空项、去重', () => {
  assert.deepEqual(normalizeTags([' a ', '', '  ', 'a', 'b']), ['a', 'b']);
  assert.deepEqual(normalizeTags([]), []);
});

test('normalizeTags 字符串按中英文逗号拆分', () => {
  assert.deepEqual(normalizeTags('a,b'), ['a', 'b']);
  assert.deepEqual(normalizeTags('前端，Vue，教程'), ['前端', 'Vue', '教程']);
  assert.deepEqual(normalizeTags(''), []);
});

test('normalizeTags 其他类型输入按空列表处理，不抛错', () => {
  assert.deepEqual(normalizeTags(undefined), []);
  assert.deepEqual(normalizeTags(null), []);
  assert.deepEqual(normalizeTags(5), []);
  assert.deepEqual(normalizeTags({}), []);
});

test('normalizeTags 跳过非字符串项', () => {
  assert.deepEqual(normalizeTags(['a', null, undefined, 5, {}, 'b']), ['a', 'b']);
});

test('isValidUrl 只接受可解析的 http/https 地址', () => {
  assert.equal(isValidUrl('https://example.com'), true);
  assert.equal(isValidUrl('http://example.com/path?q=1'), true);
  assert.equal(isValidUrl(' https://example.com '), true);
  assert.equal(isValidUrl('example.com'), false);
  assert.equal(isValidUrl('not a url'), false);
  assert.equal(isValidUrl('ftp://example.com'), false);
  assert.equal(isValidUrl(''), false);
  assert.equal(isValidUrl(null), false);
  assert.equal(isValidUrl(undefined), false);
});

function createTestDb() {
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

test('replaceLinkTags 写入清洗后的标签，不产生空项', () => {
  const db = createTestDb();
  db.prepare('INSERT INTO links (user_id, url, title) VALUES (1, ?, ?)').run('https://example.com', 't');

  const written = replaceLinkTags(db, 1, [' a ', '', '  ', 'a', 'b', null]);
  assert.deepEqual(written, ['a', 'b']);

  const rows = db.prepare('SELECT tag FROM link_tags WHERE link_id = 1 ORDER BY id').all();
  assert.deepEqual(rows.map((r) => r.tag), ['a', 'b']);
  db.close();
});

test('replaceLinkTags 先清后写，空输入等于清空', () => {
  const db = createTestDb();
  db.prepare('INSERT INTO links (user_id, url, title) VALUES (1, ?, ?)').run('https://example.com', 't');
  replaceLinkTags(db, 1, ['x', 'y']);

  replaceLinkTags(db, 1, ['z']);
  assert.deepEqual(db.prepare('SELECT tag FROM link_tags WHERE link_id = 1').all().map((r) => r.tag), ['z']);

  replaceLinkTags(db, 1, undefined);
  assert.deepEqual(db.prepare('SELECT tag FROM link_tags WHERE link_id = 1').all(), []);
  db.close();
});

test('getLinkWithTags 返回分类信息和清洗后的标签', () => {
  const db = createTestDb();
  db.prepare("INSERT INTO categories (user_id, name, color) VALUES (1, 'Dev', '#409EFF')").run();
  db.prepare('INSERT INTO links (user_id, url, title, category_id) VALUES (1, ?, ?, 1)').run('https://example.com', 't');
  // 模拟历史脏数据：空标签、未 trim、重复
  const insertTag = db.prepare('INSERT INTO link_tags (link_id, tag) VALUES (1, ?)');
  insertTag.run(' a ');
  insertTag.run('');
  insertTag.run('a');

  const link = getLinkWithTags(db, 1);
  assert.equal(link.category_name, 'Dev');
  assert.deepEqual(link.tags, ['a']);

  assert.equal(getLinkWithTags(db, 999), null);
  db.close();
});
