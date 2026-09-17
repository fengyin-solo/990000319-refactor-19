import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  isValidHttpUrl,
  getUrlHostname,
  parseTags,
  formatReviewDate,
  parseReviewDate,
  isReviewDateDisabled,
  getQuickReviewDate,
  createEmptyLinkForm,
  linkToFormState,
  buildLinkPayload,
} from './link.js'

test('isValidHttpUrl 只接受 http/https 地址', () => {
  assert.equal(isValidHttpUrl('https://example.com'), true)
  assert.equal(isValidHttpUrl('http://example.com/path?q=1'), true)
  assert.equal(isValidHttpUrl('  https://example.com  '), true) // 首尾空白可接受
  assert.equal(isValidHttpUrl('ftp://example.com'), false)
  assert.equal(isValidHttpUrl('javascript:alert(1)'), false)
  assert.equal(isValidHttpUrl('example.com'), false)
  assert.equal(isValidHttpUrl(''), false)
  assert.equal(isValidHttpUrl(null), false)
  assert.equal(isValidHttpUrl(undefined), false)
})

test('getUrlHostname 取主机名，非法地址回退为原字符串', () => {
  assert.equal(getUrlHostname('https://developer.mozilla.org/zh-CN/'), 'developer.mozilla.org')
  assert.equal(getUrlHostname('not a url'), 'not a url')
})

test('parseTags 按中英文逗号拆分并清理', () => {
  assert.deepEqual(parseTags('前端, Vue, 教程'), ['前端', 'Vue', '教程'])
  assert.deepEqual(parseTags('前端，Vue，教程'), ['前端', 'Vue', '教程'])
  assert.deepEqual(parseTags('a，b,c'), ['a', 'b', 'c'])
})

test('parseTags 过滤空项，保存后不会多出空标签', () => {
  assert.deepEqual(parseTags(''), [])
  assert.deepEqual(parseTags('a,,b, ,'), ['a', 'b'])
  assert.deepEqual(parseTags('a，，b'), ['a', 'b'])
  assert.deepEqual(parseTags(['a', '', '  ', 'b']), ['a', 'b'])
  assert.deepEqual(parseTags(['a', null, undefined, 5, 'b']), ['a', 'b'])
})

test('parseTags 按顺序去重', () => {
  assert.deepEqual(parseTags('a, a, b, a'), ['a', 'b'])
  assert.deepEqual(parseTags(['x', 'x', 'y']), ['x', 'y'])
})

test('parseTags 对非字符串输入返回空数组', () => {
  assert.deepEqual(parseTags(null), [])
  assert.deepEqual(parseTags(undefined), [])
  assert.deepEqual(parseTags(123), [])
})

test('formatReviewDate 按本地年月日格式化，不受时区偏移影响', () => {
  // 本地时间的 2026-09-17（任意时区下都应得到同一天）
  assert.equal(formatReviewDate(new Date(2026, 8, 17)), '2026-09-17')
  assert.equal(formatReviewDate(new Date(2026, 0, 5)), '2026-01-05')
  assert.equal(formatReviewDate(null), null)
  assert.equal(formatReviewDate('not a date'), null)
})

test('parseReviewDate 回显已有日期，非法值返回 null', () => {
  const date = parseReviewDate('2026-09-17')
  assert.ok(date instanceof Date)
  assert.equal(formatReviewDate(date), '2026-09-17')
  assert.equal(parseReviewDate(null), null)
  assert.equal(parseReviewDate('garbage'), null)
})

test('isReviewDateDisabled 禁用今天之前的日期', () => {
  const twoDaysAgo = new Date()
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  assert.equal(isReviewDateDisabled(twoDaysAgo), true)
  assert.equal(isReviewDateDisabled(tomorrow), false)
})

test('getQuickReviewDate 返回今天起 N 天后', () => {
  const in3Days = getQuickReviewDate(3)
  const expected = new Date()
  expected.setDate(expected.getDate() + 3)
  assert.equal(formatReviewDate(in3Days), formatReviewDate(expected))
})

test('buildLinkPayload 统一产出保存请求体', () => {
  const form = {
    ...createEmptyLinkForm(),
    url: '  https://example.com  ',
    title: '  示例  ',
    tagsInput: '前端，Vue, ,前端',
    is_read_later: true,
    review_date: new Date(2026, 8, 20),
  }
  const payload = buildLinkPayload(form)
  assert.equal(payload.url, 'https://example.com')
  assert.equal(payload.title, '示例')
  assert.deepEqual(payload.tags, ['前端', 'Vue'])
  assert.equal(payload.is_read_later, true)
  assert.equal(payload.review_date, '2026-09-20')
})

test('buildLinkPayload 未勾选稍后阅读时清空回顾日期', () => {
  const form = {
    ...createEmptyLinkForm(),
    url: 'https://example.com',
    title: '示例',
    is_read_later: false,
    review_date: new Date(2026, 8, 20),
  }
  const payload = buildLinkPayload(form)
  assert.equal(payload.is_read_later, false)
  assert.equal(payload.review_date, null)
})

test('已有数据打开再保存：字段完整往返、标签不出空项', () => {
  // 模拟后端返回的已有链接（与列表刷新后的数据形状一致）
  const existing = {
    id: 7,
    url: 'https://vuejs.org/',
    title: 'Vue.js 官网',
    description: '渐进式 JavaScript 框架',
    category_id: 3,
    tags: ['前端', 'Vue', '框架'],
    is_read_later: 1,
    review_date: '2026-09-20',
  }

  // 打开：回显到表单
  const form = linkToFormState(existing)
  assert.equal(form.url, 'https://vuejs.org/')
  assert.equal(form.tagsInput, '前端, Vue, 框架')
  assert.equal(form.is_read_later, true)
  assert.equal(formatReviewDate(form.review_date), '2026-09-20')

  // 保存：不改动任何内容直接提交
  const payload = buildLinkPayload(form)
  assert.equal(payload.url, existing.url)
  assert.equal(payload.title, existing.title)
  assert.equal(payload.description, existing.description)
  assert.equal(payload.category_id, existing.category_id)
  assert.deepEqual(payload.tags, existing.tags)
  assert.equal(payload.is_read_later, true)
  assert.equal(payload.review_date, existing.review_date)
  assert.ok(payload.tags.every((t) => t.trim() !== ''))
})

test('已有数据打开再保存：非稍后阅读的链接保持干净', () => {
  const existing = {
    id: 8,
    url: 'https://github.com/',
    title: 'GitHub',
    description: '',
    category_id: null,
    tags: [],
    is_read_later: 0,
    review_date: null,
  }
  const payload = buildLinkPayload(linkToFormState(existing))
  assert.deepEqual(payload.tags, [])
  assert.equal(payload.is_read_later, false)
  assert.equal(payload.review_date, null)
})
