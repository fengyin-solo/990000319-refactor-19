const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

// 在加载任何模块前指向临时数据库，避免碰真实数据
const TEST_DB = path.join(os.tmpdir(), `links-api-test-${process.pid}.db`);
process.env.LINKS_DB_PATH = TEST_DB;

const express = require('express');
const jwt = require('jsonwebtoken');
const { initDatabase, getDb } = require('../db/init');
const { JWT_SECRET } = require('../middleware/auth');
const linkRoutes = require('../routes/links');

let server;
let baseUrl;
const token = jwt.sign({ userId: 1 }, JWT_SECRET);
const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

function api(pathname, options = {}) {
  return fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: { ...authHeaders, ...(options.headers || {}) },
  });
}

before(async () => {
  initDatabase();
  const db = getDb();

  // 预置一个用户、一个分类和一条已有链接（模拟库里的旧数据）
  db.prepare('INSERT INTO users (username, email, password) VALUES (?, ?, ?)').run(
    'demo',
    'demo@example.com',
    'hashed'
  );
  db.prepare('INSERT INTO categories (user_id, name, color) VALUES (?, ?, ?)').run(
    1,
    'Development',
    '#409EFF'
  );
  const linkId = db
    .prepare(
      `INSERT INTO links (user_id, url, title, description, category_id, status, is_read_later, review_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(1, 'https://vuejs.org/', 'Vue.js 官网', '渐进式框架', 1, 'unchecked', 1, '2026-09-20').lastInsertRowid;
  const insertTag = db.prepare('INSERT INTO link_tags (link_id, tag) VALUES (?, ?)');
  for (const tag of ['前端', 'Vue', '框架']) {
    insertTag.run(linkId, tag);
  }

  const app = express();
  app.use(express.json());
  app.use('/api/links', linkRoutes);

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(TEST_DB + suffix, { force: true });
  }
});

test('已有数据能正常打开：列表返回完整链接与标签', async () => {
  const res = await api('/api/links');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.total, 1);
  const link = body.links[0];
  assert.equal(link.url, 'https://vuejs.org/');
  assert.equal(link.category_name, 'Development');
  assert.deepEqual(link.tags, ['前端', 'Vue', '框架']);
  assert.equal(link.is_read_later, 1);
  assert.equal(link.review_date, '2026-09-20');
});

test('已有数据能正常保存：编辑后字段完整、标签无空项', async () => {
  // 模拟前端编辑保存：标签输入框里混入空项和中文逗号拆分后的结果
  const res = await api('/api/links/1', {
    method: 'PUT',
    body: JSON.stringify({
      url: 'https://vuejs.org/',
      title: 'Vue.js 官网',
      description: '渐进式框架',
      category_id: 1,
      tags: ['前端', 'Vue', '框架', '', '  '],
      is_read_later: true,
      review_date: '2026-09-20',
    }),
  });
  assert.equal(res.status, 200);
  const link = await res.json();
  assert.deepEqual(link.tags, ['前端', 'Vue', '框架']);
  assert.equal(link.review_date, '2026-09-20');

  // 再读一次列表确认落库结果
  const listRes = await api('/api/links');
  const listBody = await listRes.json();
  assert.deepEqual(listBody.links[0].tags, ['前端', 'Vue', '框架']);
});

test('保存时标签按字符串传入也能被拆分归一', async () => {
  const res = await api('/api/links/1', {
    method: 'PUT',
    body: JSON.stringify({ tags: '文档, 教程，文档' }),
  });
  assert.equal(res.status, 200);
  const link = await res.json();
  assert.deepEqual(link.tags, ['文档', '教程']);

  // 恢复标签，避免影响后续用例
  await api('/api/links/1', {
    method: 'PUT',
    body: JSON.stringify({ tags: ['前端', 'Vue', '框架'] }),
  });
});

test('新建链接：非法 URL 被拒绝，合法 URL 去空白保存', async () => {
  const bad = await api('/api/links', {
    method: 'POST',
    body: JSON.stringify({ url: 'not-a-url', title: '坏链接' }),
  });
  assert.equal(bad.status, 400);

  const good = await api('/api/links', {
    method: 'POST',
    body: JSON.stringify({
      url: '  https://github.com/  ',
      title: 'GitHub',
      tags: ['工具', '', 'Git'],
      is_read_later: false,
      review_date: '2026-10-01',
    }),
  });
  assert.equal(good.status, 200);
  const link = await good.json();
  assert.equal(link.url, 'https://github.com/');
  assert.deepEqual(link.tags, ['工具', 'Git']);
  // 未勾选稍后阅读时回顾日期应被清空，不留脏数据
  assert.equal(link.is_read_later, 0);
  assert.equal(link.review_date, null);
});

test('编辑链接：非法 URL 被拒绝', async () => {
  const res = await api('/api/links/1', {
    method: 'PUT',
    body: JSON.stringify({ url: 'ftp://example.com' }),
  });
  assert.equal(res.status, 400);
});

test('稍后阅读：加入时回顾日期归一，移除后清空', async () => {
  const add = await api('/api/links/2/read-later', {
    method: 'POST',
    body: JSON.stringify({ review_date: '2026-10-01T16:00:00.000Z' }),
  });
  assert.equal(add.status, 200);
  const added = await add.json();
  assert.equal(added.is_read_later, 1);
  assert.equal(added.review_date, '2026-10-01');
  assert.equal(added.review_status, 'pending');

  const remove = await api('/api/links/2/read-later', { method: 'DELETE' });
  assert.equal(remove.status, 200);

  const listRes = await api('/api/links');
  const listBody = await listRes.json();
  const link2 = listBody.links.find((l) => l.id === 2);
  assert.equal(link2.is_read_later, 0);
  assert.equal(link2.review_date, null);
});
