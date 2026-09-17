/**
 * 链接保存链路的共用处理（与前端 src/utils/link.js 同一套规则）。
 *
 * 地址格式、标签拆分、稍后阅读计划的归一化，以及
 * “写入标签 / 取出链接（含分类与标签）” 的统一实现，
 * POST /api/links、PUT /api/links/:id、稍后阅读相关路由都以这份为准。
 */

/** 只接受 http/https 的合法 URL（与前端校验、书签导入的口径一致） */
function isValidHttpUrl(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * 把标签输入归一成干净的标签数组。
 * 接受数组或字符串（按中英文逗号拆分），逐项 trim、去掉空项、按顺序去重，
 * 非字符串项会被忽略，保证写库后不会出现空标签。
 */
function normalizeTags(input) {
  const items = Array.isArray(input)
    ? input
    : typeof input === 'string'
      ? input.split(/[,，]/)
      : [];
  const seen = new Set();
  const tags = [];
  for (const item of items) {
    if (typeof item !== 'string') continue;
    const tag = item.trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  return tags;
}

/**
 * 把回顾日期归一成 'YYYY-MM-DD' 或 null。
 * 接受 Date、ISO 字符串或 'YYYY-MM-DD'，非法输入一律置 null。
 */
function normalizeReviewDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const date = new Date(trimmed);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  return null;
}

/** 追加写入标签（自动归一，事务内执行） */
function insertLinkTags(db, linkId, tags) {
  const tagList = normalizeTags(tags);
  if (tagList.length === 0) return;
  const insertTag = db.prepare('INSERT INTO link_tags (link_id, tag) VALUES (?, ?)');
  const insertAll = db.transaction((list) => {
    for (const tag of list) {
      insertTag.run(linkId, tag);
    }
  });
  insertAll(tagList);
}

/** 全量替换某条链接的标签（先清后写，自动归一） */
function replaceLinkTags(db, linkId, tags) {
  db.prepare('DELETE FROM link_tags WHERE link_id = ?').run(linkId);
  insertLinkTags(db, linkId, tags);
}

/** 取出链接（含分类名称/颜色与标签数组），列表与保存后的回显统一走这里 */
function fetchLinkWithTags(db, id) {
  const link = db
    .prepare(
      `SELECT l.*, c.name as category_name, c.color as category_color
       FROM links l
       LEFT JOIN categories c ON l.category_id = c.id
       WHERE l.id = ?`
    )
    .get(id);
  if (!link) return null;
  const tags = db.prepare('SELECT tag FROM link_tags WHERE link_id = ?').all(id);
  return { ...link, tags: tags.map((t) => t.tag) };
}

module.exports = {
  isValidHttpUrl,
  normalizeTags,
  normalizeReviewDate,
  insertLinkTags,
  replaceLinkTags,
  fetchLinkWithTags,
};
