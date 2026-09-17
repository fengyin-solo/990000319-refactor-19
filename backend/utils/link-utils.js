/**
 * 链接保存链路的共用处理逻辑。
 *
 * 地址格式校验、标签清洗、标签写入、带标签查询在创建/更新/稍后阅读等
 * 接口里都以此为准，避免多处各写一遍导致行为不一致（例如保存后标签出现空项）。
 * 语义与前端 frontend/src/utils/link-utils.js 保持一致，
 * 由 backend/tests/frontend-parity.test.js 统一检查。
 */

/**
 * 标签拆分与清洗。
 * - 字符串：按中英文逗号拆分
 * - 数组：逐项清洗
 * - 其他输入：按空列表处理，不会因为脏数据抛错
 * 统一去空白、去空项、去重，保证不会产生空标签。
 *
 * @param {unknown} tags
 * @returns {string[]}
 */
function normalizeTags(tags) {
  let items;
  if (Array.isArray(tags)) {
    items = tags;
  } else if (typeof tags === 'string') {
    items = tags.split(/[,，]/);
  } else {
    return [];
  }
  const seen = new Set();
  const result = [];
  for (const item of items) {
    if (typeof item !== 'string') continue;
    const tag = item.trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    result.push(tag);
  }
  return result;
}

/**
 * 统一的地址格式校验：必须是可解析的 http/https URL。
 *
 * @param {unknown} url
 * @returns {boolean}
 */
function isValidUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return false;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * 用一份事务替换某个链接的全部标签（先清后写），创建和更新共用。
 *
 * @param {object} db better-sqlite3 连接
 * @param {number} linkId
 * @param {unknown} tags 原始标签输入
 * @returns {string[]} 实际写入的标签
 */
function replaceLinkTags(db, linkId, tags) {
  const normalized = normalizeTags(tags);
  db.prepare('DELETE FROM link_tags WHERE link_id = ?').run(linkId);
  if (normalized.length > 0) {
    const insertTag = db.prepare('INSERT INTO link_tags (link_id, tag) VALUES (?, ?)');
    const insertMany = db.transaction((tagList) => {
      for (const tag of tagList) {
        insertTag.run(linkId, tag);
      }
    });
    insertMany(normalized);
  }
  return normalized;
}

/**
 * 查询单个链接（含分类信息和清洗后的标签），各接口返回数据统一走这里。
 *
 * @param {object} db better-sqlite3 连接
 * @param {number} linkId
 * @returns {object|null}
 */
function getLinkWithTags(db, linkId) {
  const link = db.prepare(`
    SELECT l.*, c.name as category_name, c.color as category_color
    FROM links l
    LEFT JOIN categories c ON l.category_id = c.id
    WHERE l.id = ?
  `).get(linkId);

  if (!link) return null;

  const tags = db.prepare('SELECT tag FROM link_tags WHERE link_id = ?').all(linkId);
  return {
    ...link,
    tags: normalizeTags(tags.map((t) => t.tag)),
  };
}

module.exports = { normalizeTags, isValidUrl, replaceLinkTags, getLinkWithTags };
