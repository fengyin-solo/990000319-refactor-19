/**
 * 统一检查：添加/编辑链接与稍后阅读这条链路上的共用逻辑，
 * 保证已有的数据仍然能正常打开和保存。
 *
 * 做法：把现有的 data/links.db 复制到临时目录（不动真实数据），
 * 用真实路由起一个服务，然后对库里的每一条现有链接模拟
 * “打开编辑弹窗 → 原样保存”的完整流程，并覆盖三条入口：
 * 添加链接、编辑链接、从卡片加入稍后阅读。
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// 在加载任何应用代码之前，把数据库指向真实数据的副本
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'links-check-'));
const realDbDir = path.join(__dirname, '..', 'data');
for (const file of ['links.db', 'links.db-wal', 'links.db-shm']) {
  const src = path.join(realDbDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(tmpDir, file));
  }
}
process.env.LINKS_DB_PATH = path.join(tmpDir, 'links.db');

const express = require('express');
const { initDatabase } = require('../db/init');
const { normalizeTags, isValidUrl } = require('../utils/link-utils');

initDatabase();

const app = express();
app.use(express.json());
app.use('/api/auth', require('../routes/auth'));
app.use('/api/links', require('../routes/links'));
app.use('/api/categories', require('../routes/categories'));

let server;
let baseUrl;
let token;
// 前端共用模块（表单校验、保存请求、列表刷新都以它为准）
let frontend;

async function api(method, url, body) {
  const res = await fetch(`${baseUrl}${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  return { status: res.status, data };
}

before(async () => {
  frontend = await import('../../frontend/src/utils/link-utils.js');
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const { status, data } = await api('POST', '/api/auth/login', {
    username: 'demo',
    password: 'demo123',
  });
  assert.equal(status, 200);
  token = data.token;
});

after(() => {
  server?.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('已有数据：每条链接都能通过统一的地址校验', async () => {
  const { status, data } = await api('GET', '/api/links?limit=100');
  assert.equal(status, 200);
  assert.ok(data.links.length > 0, '测试数据库里应该有现有链接');

  for (const link of data.links) {
    assert.ok(isValidUrl(link.url), `现有链接 #${link.id} 的地址应通过统一校验: ${link.url}`);
    assert.ok(frontend.isValidUrl(link.url), `现有链接 #${link.id} 的地址应通过前端统一校验`);
  }
});

test('已有数据：每条链接都能正常打开（弹窗回填）并原样保存', async () => {
  const { data } = await api('GET', '/api/links?limit=100');

  for (const link of data.links) {
    // 模拟打开编辑弹窗：与 LinkForm 回填逻辑完全一致
    const form = {
      url: link.url,
      title: link.title,
      description: link.description || '',
      category_id: link.category_id,
      tagsInput: frontend.formatTagsInput(link.tags),
      is_read_later: Boolean(link.is_read_later),
      review_date: frontend.parseReviewDate(link.review_date),
    };
    // 模拟点击保存：与 LinkForm 的保存请求完全一致
    const payload = frontend.buildLinkPayload(form);

    const { status, data: saved } = await api('PUT', `/api/links/${link.id}`, payload);
    assert.equal(status, 200, `现有链接 #${link.id} 应能保存`);

    // 保存后数据不变样：地址、标题、稍后阅读计划保持原值
    assert.equal(saved.url, link.url, `#${link.id} 地址不应变化`);
    assert.equal(saved.title, link.title, `#${link.id} 标题不应变化`);
    assert.equal(saved.is_read_later, link.is_read_later, `#${link.id} 稍后阅读标记不应变化`);
    assert.equal(saved.review_date, payload.review_date, `#${link.id} 回顾日期不应变化`);
    // 标签经过统一清洗，不含空项，且与表单往返一致
    assert.deepEqual(saved.tags, payload.tags, `#${link.id} 标签往返应一致`);
    assert.deepEqual(saved.tags, normalizeTags(link.tags), `#${link.id} 标签应等于统一清洗结果`);
    for (const tag of saved.tags) {
      assert.ok(tag.trim().length > 0, `#${link.id} 不应出现空标签`);
    }
  }
});

test('添加链接：脏标签输入保存后不会产生空项', async () => {
  const { status, data } = await api('POST', '/api/links', {
    url: 'https://check-example.com',
    title: '脏标签检查',
    tags: [' a ', '', '  ', 'a', 'b', null, 5],
    is_read_later: true,
    review_date: '2026-10-01',
  });
  assert.equal(status, 200);
  assert.deepEqual(data.tags, ['a', 'b']);
  assert.equal(data.is_read_later, 1);
  assert.equal(data.review_date, '2026-10-01');

  // 标签云里也不应出现空项
  const tagsRes = await api('GET', '/api/categories/tags');
  assert.equal(tagsRes.status, 200);
  for (const row of tagsRes.data) {
    assert.ok(row.tag.trim().length > 0, '标签云不应出现空标签');
  }
});

test('添加链接：地址格式由统一校验把关', async () => {
  const missing = await api('POST', '/api/links', { title: 'x' });
  assert.equal(missing.status, 400);

  const invalid = await api('POST', '/api/links', { url: 'not a url', title: 'x' });
  assert.equal(invalid.status, 400);

  const ok = await api('POST', '/api/links', { url: 'https://valid-example.com', title: 'x' });
  assert.equal(ok.status, 200);
});

test('编辑链接：非法地址被拒绝，只改回顾日期不影响标签', async () => {
  const created = await api('POST', '/api/links', {
    url: 'https://schedule-example.com',
    title: '计划检查',
    tags: ['x', 'y'],
  });
  const id = created.data.id;

  const badUrl = await api('PUT', `/api/links/${id}`, { url: 'not a url' });
  assert.equal(badUrl.status, 400);

  // 稍后阅读页“设置计划”的保存请求：只带 review_date
  const scheduled = await api('PUT', `/api/links/${id}`, { review_date: '2026-10-05' });
  assert.equal(scheduled.status, 200);
  assert.equal(scheduled.data.review_date, '2026-10-05');
  assert.deepEqual(scheduled.data.tags, ['x', 'y'], '设置计划不应改动标签');
});

test('从卡片加入稍后阅读：标记、取消、状态流转正常', async () => {
  const created = await api('POST', '/api/links', {
    url: 'https://read-later-example.com',
    title: '稍后阅读检查',
    tags: ['rl'],
  });
  const id = created.data.id;
  assert.equal(created.data.is_read_later, 0);

  const added = await api('POST', `/api/links/${id}/read-later`, { review_date: '2026-10-03' });
  assert.equal(added.status, 200);
  assert.equal(added.data.is_read_later, 1);
  assert.equal(added.data.review_date, '2026-10-03');
  assert.equal(added.data.review_status, 'pending');
  assert.deepEqual(added.data.tags, ['rl']);

  const list = await api('GET', '/api/links/read-later?status=all&limit=100');
  assert.equal(list.status, 200);
  assert.ok(list.data.links.some((l) => l.id === id), '稍后阅读列表里应能找到该链接');

  const removed = await api('DELETE', `/api/links/${id}/read-later`);
  assert.equal(removed.status, 200);
  const afterRemove = await api('GET', '/api/links?limit=100');
  const link = afterRemove.data.links.find((l) => l.id === id);
  assert.equal(link.is_read_later, 0);
});

test('列表刷新：返回数据经过统一清洗，没有空标签', async () => {
  for (const url of ['/api/links?limit=100', '/api/links/read-later?status=all&limit=100']) {
    const { status, data } = await api('GET', url);
    assert.equal(status, 200);
    for (const link of data.links) {
      assert.deepEqual(link.tags, normalizeTags(link.tags));
      for (const tag of link.tags) {
        assert.ok(tag.trim().length > 0, `${url} 返回的链接 #${link.id} 不应有空标签`);
      }
    }
  }
});
