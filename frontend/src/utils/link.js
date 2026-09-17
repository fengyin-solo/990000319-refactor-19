/**
 * 链接表单/保存链路的共用处理。
 *
 * 添加链接、编辑链接、从卡片加入稍后阅读三条入口共用的规则都收在这里：
 *  - 地址格式校验与展示
 *  - 标签拆分（兼容中英文逗号，去空白、去重）
 *  - 稍后阅读计划（回顾日期的格式化、快捷日期、禁用日期）
 *  - 表单状态 <-> 保存请求体 的互相转换
 *
 * 表单校验、保存请求、保存成功后的列表回显都以这份实现为准。
 */

/** 只接受 http/https 的合法 URL（与后端、书签导入的口径一致） */
export function isValidHttpUrl(value) {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (!trimmed) return false
  try {
    const url = new URL(trimmed)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/** 卡片上展示的地址（主机名），解析失败时回退为原始字符串 */
export function getUrlHostname(value) {
  try {
    return new URL(value).hostname
  } catch {
    return value
  }
}

/**
 * 把标签输入拆成干净的标签数组。
 * 接受字符串（按中英文逗号拆分）或数组，逐项 trim、去掉空项、按顺序去重。
 * 非字符串项会被忽略，保证保存后不会出现空标签。
 */
export function parseTags(input) {
  const items = Array.isArray(input) ? input : typeof input === 'string' ? input.split(/[,，]/) : []
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
 * 把日期格式化为后端存储用的 'YYYY-MM-DD'。
 * 使用本地年月日，避免 toISOString() 的时区偏移导致日期偏一天。
 * 无法解析时返回 null。
 */
export function formatReviewDate(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 把后端返回的回顾日期解析成 Date（表单回显用），无值或非法时返回 null。
 * 纯日期串（YYYY-MM-DD）按本地日历日解析，避免 UTC 解析在负时区下偏一天。
 */
export function parseReviewDate(value) {
  if (!value) return null
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  if (typeof value === 'string') {
    const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (match) {
      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    }
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
  return null
}

/** 日期选择器禁用今天之前的日期 */
export function isReviewDateDisabled(time) {
  return time.getTime() < Date.now() - 86400000
}

/** 快捷回顾日期：今天起 N 天后 */
export function getQuickReviewDate(days) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date
}

/** 空白表单状态（添加链接） */
export function createEmptyLinkForm() {
  return {
    url: '',
    title: '',
    description: '',
    category_id: null,
    tagsInput: '',
    is_read_later: false,
    review_date: null,
  }
}

/** 已有链接 -> 表单状态（编辑链接打开弹窗时回显） */
export function linkToFormState(link) {
  return {
    url: link.url || '',
    title: link.title || '',
    description: link.description || '',
    category_id: link.category_id ?? null,
    tagsInput: Array.isArray(link.tags) ? link.tags.join(', ') : '',
    is_read_later: Boolean(link.is_read_later),
    review_date: parseReviewDate(link.review_date),
  }
}

/**
 * 表单状态 -> 保存请求体。
 * URL 去首尾空白；标签统一走 parseTags；未勾选稍后阅读时回顾日期清空，
 * 避免留下 is_read_later = false 但带 review_date 的脏数据。
 */
export function buildLinkPayload(form) {
  const isReadLater = Boolean(form.is_read_later)
  return {
    url: (form.url || '').trim(),
    title: (form.title || '').trim(),
    description: form.description || '',
    category_id: form.category_id ?? null,
    tags: parseTags(form.tagsInput),
    is_read_later: isReadLater,
    review_date: isReadLater ? formatReviewDate(form.review_date) : null,
  }
}
