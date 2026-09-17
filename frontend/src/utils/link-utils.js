/**
 * 链接表单与列表的共用处理逻辑。
 *
 * 添加链接、编辑链接、稍后阅读计划相关的地址格式、标签拆分、回顾日期
 * 全部以这里为准：表单校验、保存请求、保存成功后的列表刷新都使用这些函数，
 * 避免多处各写一遍导致行为不一致（例如保存后标签出现空项）。
 */

/**
 * 标签拆分与清洗。
 * - 字符串（输入框内容）：按中英文逗号拆分
 * - 数组（接口返回的标签）：逐项清洗
 * - 其他输入：按空列表处理
 * 统一去空白、去空项、去重，保证不会产生空标签。
 *
 * @param {string|string[]|null|undefined} input
 * @returns {string[]}
 */
export function parseTags(input) {
  let items
  if (Array.isArray(input)) {
    items = input
  } else if (typeof input === 'string') {
    items = input.split(/[,，]/)
  } else {
    return []
  }
  const seen = new Set()
  const tags = []
  for (const item of items) {
    if (typeof item !== 'string') continue
    const tag = item.trim()
    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    tags.push(tag)
  }
  return tags
}

/**
 * 标签数组转成输入框展示的字符串（与 parseTags 互为往返）。
 *
 * @param {string[]|null|undefined} tags
 * @returns {string}
 */
export function formatTagsInput(tags) {
  return parseTags(tags).join(', ')
}

/**
 * 统一的地址格式校验：必须是可解析的 http/https URL。
 * 表单校验和保存请求都以此为准。
 *
 * @param {string} url
 * @returns {boolean}
 */
export function isValidUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return false
  try {
    const parsed = new URL(url.trim())
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * 卡片上展示的地址（取域名，解析失败时原样显示）。
 *
 * @param {string} url
 * @returns {string}
 */
export function getUrlHost(url) {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

/**
 * 回顾日期统一序列化为 'YYYY-MM-DD'，空值返回 null（保存请求用）。
 *
 * @param {Date|string|null|undefined} value
 * @returns {string|null}
 */
export function formatReviewDate(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().split('T')[0]
}

/**
 * 接口返回的回顾日期转成 Date 对象（打开弹窗回填用），空值/非法值返回 null。
 *
 * @param {string|Date|null|undefined} value
 * @returns {Date|null}
 */
export function parseReviewDate(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * 回顾日期选择器禁用逻辑：今天以前的日期不可选。
 *
 * @param {Date} time
 * @returns {boolean}
 */
export function isReviewDateDisabled(time) {
  return time.getTime() < Date.now() - 86400000
}

/**
 * 快捷回顾日期：今天起第 days 天。
 *
 * @param {number} days
 * @returns {Date}
 */
export function getQuickReviewDate(days) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date
}

/**
 * 表单数据 → 保存请求 payload。添加链接和编辑链接共用同一份组装逻辑。
 *
 * @param {{url: string, title: string, description: string, category_id: number|null,
 *          tagsInput: string, is_read_later: boolean, review_date: Date|string|null}} form
 * @returns {{url: string, title: string, description: string, category_id: number|null,
 *          tags: string[], is_read_later: boolean, review_date: string|null}}
 */
export function buildLinkPayload(form) {
  return {
    url: typeof form.url === 'string' ? form.url.trim() : form.url,
    title: form.title,
    description: form.description,
    category_id: form.category_id,
    tags: parseTags(form.tagsInput),
    is_read_later: Boolean(form.is_read_later),
    review_date: formatReviewDate(form.review_date),
  }
}

/**
 * 列表数据的统一清洗：标签经过 parseTags 处理，
 * 保证历史脏数据（空标签、未 trim、重复）不会在列表和卡片上渲染出来。
 * 保存成功后的列表刷新以此为准。
 *
 * @param {object} link
 * @returns {object}
 */
export function normalizeLink(link) {
  if (!link || typeof link !== 'object') return link
  return {
    ...link,
    tags: parseTags(link.tags),
  }
}
