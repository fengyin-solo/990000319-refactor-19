import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseTags,
  formatTagsInput,
  isValidUrl,
  getUrlHost,
  formatReviewDate,
  parseReviewDate,
  isReviewDateDisabled,
  getQuickReviewDate,
  buildLinkPayload,
  normalizeLink,
} from './link-utils.js'

test('parseTags 拆分英文逗号并去空白', () => {
  assert.deepEqual(parseTags('前端, Vue, 教程'), ['前端', 'Vue', '教程'])
})

test('parseTags 拆分中文逗号', () => {
  assert.deepEqual(parseTags('前端，Vue，教程'), ['前端', 'Vue', '教程'])
  assert.deepEqual(parseTags('前端,，Vue'), ['前端', 'Vue'])
})

test('parseTags 不会产生空项', () => {
  assert.deepEqual(parseTags(''), [])
  assert.deepEqual(parseTags(',,,'), [])
  assert.deepEqual(parseTags('前端,, Vue,'), ['前端', 'Vue'])
  assert.deepEqual(parseTags(' ,  , '), [])
  assert.deepEqual(parseTags(null), [])
  assert.deepEqual(parseTags(undefined), [])
})

test('parseTags 数组输入同样清洗空项和非字符串项', () => {
  assert.deepEqual(parseTags([' a ', '', '  ', 'b']), ['a', 'b'])
  assert.deepEqual(parseTags(['a', null, undefined, 5, 'b']), ['a', 'b'])
  assert.deepEqual(parseTags([]), [])
})

test('parseTags 去重且保持顺序', () => {
  assert.deepEqual(parseTags('Vue, 前端, Vue'), ['Vue', '前端'])
  assert.deepEqual(parseTags(['a', 'a', 'b']), ['a', 'b'])
})

test('formatTagsInput 与 parseTags 往返稳定', () => {
  assert.equal(formatTagsInput(['前端', 'Vue']), '前端, Vue')
  assert.equal(formatTagsInput([]), '')
  assert.equal(formatTagsInput(null), '')
  const once = parseTags(formatTagsInput(['前端', 'Vue', '教程']))
  assert.deepEqual(once, ['前端', 'Vue', '教程'])
  assert.equal(formatTagsInput(once), '前端, Vue, 教程')
})

test('isValidUrl 只接受可解析的 http/https 地址', () => {
  assert.equal(isValidUrl('https://example.com'), true)
  assert.equal(isValidUrl('http://example.com/path?q=1'), true)
  assert.equal(isValidUrl(' https://example.com '), true)
  assert.equal(isValidUrl('example.com'), false)
  assert.equal(isValidUrl('not a url'), false)
  assert.equal(isValidUrl('ftp://example.com'), false)
  assert.equal(isValidUrl(''), false)
  assert.equal(isValidUrl(null), false)
})

test('getUrlHost 取域名，解析失败原样返回', () => {
  assert.equal(getUrlHost('https://developer.mozilla.org/zh-CN/'), 'developer.mozilla.org')
  assert.equal(getUrlHost('not a url'), 'not a url')
})

test('formatReviewDate 序列化为 YYYY-MM-DD，空值为 null', () => {
  const date = new Date('2026-09-20T12:00:00.000Z')
  assert.equal(formatReviewDate(date), '2026-09-20')
  assert.equal(formatReviewDate(null), null)
  assert.equal(formatReviewDate(undefined), null)
  assert.equal(formatReviewDate(''), null)
  assert.equal(formatReviewDate('not a date'), null)
})

test('parseReviewDate 解析日期字符串，非法值为 null', () => {
  const date = parseReviewDate('2026-09-20')
  assert.ok(date instanceof Date)
  assert.equal(Number.isNaN(date.getTime()), false)
  assert.equal(parseReviewDate(null), null)
  assert.equal(parseReviewDate('not a date'), null)
})

test('isReviewDateDisabled 禁用今天以前的日期', () => {
  assert.equal(isReviewDateDisabled(new Date(Date.now() - 2 * 86400000)), true)
  assert.equal(isReviewDateDisabled(new Date(Date.now() + 86400000)), false)
})

test('getQuickReviewDate 返回今天起第 N 天', () => {
  const before = new Date()
  before.setDate(before.getDate() + 3)
  const date = getQuickReviewDate(3)
  assert.equal(date.toDateString(), before.toDateString())
})

test('buildLinkPayload 统一组装保存请求', () => {
  const payload = buildLinkPayload({
    url: ' https://example.com ',
    title: '标题',
    description: '描述',
    category_id: 2,
    tagsInput: '前端,，Vue,, ',
    is_read_later: 1,
    review_date: new Date('2026-09-20T12:00:00.000Z'),
  })
  assert.deepEqual(payload, {
    url: 'https://example.com',
    title: '标题',
    description: '描述',
    category_id: 2,
    tags: ['前端', 'Vue'],
    is_read_later: true,
    review_date: '2026-09-20',
  })
})

test('buildLinkPayload 空表单不产生空标签和空日期', () => {
  const payload = buildLinkPayload({
    url: '',
    title: '',
    description: '',
    category_id: null,
    tagsInput: '',
    is_read_later: false,
    review_date: null,
  })
  assert.deepEqual(payload.tags, [])
  assert.equal(payload.review_date, null)
  assert.equal(payload.is_read_later, false)
})

test('normalizeLink 清洗列表数据里的脏标签', () => {
  const dirty = { id: 1, url: 'https://example.com', tags: [' a ', '', null, 'a', 'b'] }
  const clean = normalizeLink(dirty)
  assert.deepEqual(clean.tags, ['a', 'b'])
  assert.equal(clean.url, 'https://example.com')
  assert.equal(normalizeLink(null), null)
})
