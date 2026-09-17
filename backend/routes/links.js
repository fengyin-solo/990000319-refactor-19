const express = require('express');
const { getDb } = require('../db/init');
const { authMiddleware } = require('../middleware/auth');
const { normalizeTags, isValidUrl, replaceLinkTags, getLinkWithTags } = require('../utils/link-utils');

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

// GET /api/links - List links with pagination, filtering, search
router.get('/', (req, res) => {
  const { page = 1, limit = 12, category, tag, search } = req.query;
  const offset = (page - 1) * limit;
  const userId = req.userId;

  const db = getDb();

  let whereConditions = ['l.user_id = ?'];
  let params = [userId];

  if (category) {
    whereConditions.push('l.category_id = ?');
    params.push(category);
  }

  if (search) {
    whereConditions.push('(l.title LIKE ? OR l.description LIKE ? OR l.url LIKE ?)');
    const searchPattern = `%${search}%`;
    params.push(searchPattern, searchPattern, searchPattern);
  }

  let joinClause = '';
  if (tag) {
    joinClause = 'INNER JOIN link_tags lt ON l.id = lt.link_id';
    whereConditions.push('lt.tag = ?');
    params.push(tag);
  }

  const whereClause = whereConditions.join(' AND ');

  // Get total count
  const countSql = `SELECT COUNT(DISTINCT l.id) as total FROM links l ${joinClause} WHERE ${whereClause}`;
  const { total } = db.prepare(countSql).get(...params);

  // Get links
  const sql = `
    SELECT DISTINCT l.*, c.name as category_name, c.color as category_color
    FROM links l
    LEFT JOIN categories c ON l.category_id = c.id
    ${joinClause}
    WHERE ${whereClause}
    ORDER BY l.created_at DESC
    LIMIT ? OFFSET ?
  `;
  const links = db.prepare(sql).all(...params, Number(limit), Number(offset));

  // Get tags for each link
  const getTagsStmt = db.prepare('SELECT tag FROM link_tags WHERE link_id = ?');
  const linksWithTags = links.map((link) => ({
    ...link,
    tags: normalizeTags(getTagsStmt.all(link.id).map((t) => t.tag)),
  }));

  res.json({
    links: linksWithTags,
    total,
    page: Number(page),
    totalPages: Math.ceil(total / limit),
  });
});

// POST /api/links - Create a new link
router.post('/', (req, res) => {
  const { url, title, description, category_id, tags, is_read_later, review_date } = req.body;
  const userId = req.userId;

  if (!url || !title) {
    return res.status(400).json({ error: 'URL and title are required' });
  }

  if (!isValidUrl(url)) {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  const db = getDb();

  const result = db.prepare(
    'INSERT INTO links (user_id, url, title, description, category_id, status, is_read_later, review_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(userId, url, title, description || '', category_id || null, 'unchecked', is_read_later ? 1 : 0, review_date || null);

  const linkId = result.lastInsertRowid;

  // Insert tags
  replaceLinkTags(db, linkId, tags);

  res.json(getLinkWithTags(db, linkId));
});

// GET /api/links/read-later - Get read later list with filtering
// NOTE: This must come BEFORE /:id routes to avoid being matched as an id
router.get('/read-later', (req, res) => {
  const { page = 1, limit = 12, status = 'pending' } = req.query;
  const offset = (page - 1) * limit;
  const userId = req.userId;

  const db = getDb();

  const validStatuses = ['pending', 'completed', 'skipped', 'all'];
  const filterStatus = validStatuses.includes(status) ? status : 'pending';

  let whereConditions = ['l.user_id = ?', 'l.is_read_later = 1'];
  let params = [userId];

  if (filterStatus !== 'all') {
    whereConditions.push('l.review_status = ?');
    params.push(filterStatus);
  }

  const whereClause = whereConditions.join(' AND ');

  // Get total count
  const countSql = `SELECT COUNT(*) as total FROM links l WHERE ${whereClause}`;
  const { total } = db.prepare(countSql).get(...params);

  // Get read later links
  const sql = `
    SELECT l.*, c.name as category_name, c.color as category_color
    FROM links l
    LEFT JOIN categories c ON l.category_id = c.id
    WHERE ${whereClause}
    ORDER BY 
      CASE l.review_status 
        WHEN 'pending' THEN 1 
        WHEN 'completed' THEN 2 
        ELSE 3 
      END,
      l.review_date IS NULL,
      l.review_date ASC,
      l.created_at DESC
    LIMIT ? OFFSET ?
  `;
  const links = db.prepare(sql).all(...params, Number(limit), Number(offset));

  // Get tags for each link
  const getTagsStmt = db.prepare('SELECT tag FROM link_tags WHERE link_id = ?');
  const linksWithTags = links.map((link) => ({
    ...link,
    tags: normalizeTags(getTagsStmt.all(link.id).map((t) => t.tag)),
  }));

  // Get statistics
  const statsSql = `
    SELECT 
      review_status,
      COUNT(*) as count
    FROM links
    WHERE user_id = ? AND is_read_later = 1
    GROUP BY review_status
  `;
  const statsResult = db.prepare(statsSql).all(userId);
  const stats = {
    pending: 0,
    completed: 0,
    skipped: 0,
    total: 0
  };
  statsResult.forEach(s => {
    stats[s.review_status] = s.count;
    stats.total += s.count;
  });

  res.json({
    links: linksWithTags,
    total,
    page: Number(page),
    totalPages: Math.ceil(total / limit),
    stats
  });
});

// POST /api/links/:id/read-later - Add link to read later
router.post('/:id/read-later', (req, res) => {
  const { id } = req.params;
  const { review_date } = req.body;
  const userId = req.userId;

  const db = getDb();

  // Verify ownership
  const link = db.prepare('SELECT * FROM links WHERE id = ? AND user_id = ?').get(id, userId);
  if (!link) {
    return res.status(404).json({ error: 'Link not found' });
  }

  db.prepare(`
    UPDATE links
    SET is_read_later = 1, review_date = ?, review_status = 'pending'
    WHERE id = ?
  `).run(review_date || null, id);

  res.json(getLinkWithTags(db, id));
});

// DELETE /api/links/:id/read-later - Remove link from read later
router.delete('/:id/read-later', (req, res) => {
  const { id } = req.params;
  const userId = req.userId;

  const db = getDb();

  // Verify ownership
  const link = db.prepare('SELECT * FROM links WHERE id = ? AND user_id = ?').get(id, userId);
  if (!link) {
    return res.status(404).json({ error: 'Link not found' });
  }

  db.prepare(`
    UPDATE links
    SET is_read_later = 0, review_date = NULL, review_status = 'pending'
    WHERE id = ?
  `).run(id);

  res.json({ message: 'Removed from read later list' });
});

// PUT /api/links/:id/review-status - Update review status
router.put('/:id/review-status', (req, res) => {
  const { id } = req.params;
  const { review_status } = req.body;
  const userId = req.userId;

  const db = getDb();

  // Verify ownership
  const link = db.prepare('SELECT * FROM links WHERE id = ? AND user_id = ?').get(id, userId);
  if (!link) {
    return res.status(404).json({ error: 'Link not found' });
  }

  const validStatuses = ['pending', 'completed', 'skipped'];
  if (!validStatuses.includes(review_status)) {
    return res.status(400).json({ error: 'Invalid review status' });
  }

  db.prepare(`
    UPDATE links
    SET review_status = ?
    WHERE id = ?
  `).run(review_status, id);

  res.json(getLinkWithTags(db, id));
});

// PUT /api/links/:id - Update a link
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { url, title, description, category_id, tags, is_read_later, review_date, review_status } = req.body;
  const userId = req.userId;

  const db = getDb();

  // Verify ownership
  const link = db.prepare('SELECT * FROM links WHERE id = ? AND user_id = ?').get(id, userId);
  if (!link) {
    return res.status(404).json({ error: 'Link not found' });
  }

  if (url && !isValidUrl(url)) {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  // Update link
  db.prepare(`
    UPDATE links
    SET url = ?, title = ?, description = ?, category_id = ?, is_read_later = ?, review_date = ?, review_status = ?
    WHERE id = ?
  `).run(
    url || link.url,
    title || link.title,
    description ?? link.description,
    category_id ?? link.category_id,
    is_read_later !== undefined ? (is_read_later ? 1 : 0) : link.is_read_later,
    review_date !== undefined ? review_date : link.review_date,
    review_status || link.review_status,
    id
  );

  // Update tags if provided
  if (tags !== undefined) {
    replaceLinkTags(db, id, tags);
  }

  res.json(getLinkWithTags(db, id));
});

// DELETE /api/links/:id - Delete a link
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const userId = req.userId;

  const db = getDb();

  const link = db.prepare('SELECT * FROM links WHERE id = ? AND user_id = ?').get(id, userId);
  if (!link) {
    return res.status(404).json({ error: 'Link not found' });
  }

  db.prepare('DELETE FROM link_tags WHERE link_id = ?').run(id);
  db.prepare('DELETE FROM links WHERE id = ?').run(id);

  res.json({ message: 'Link deleted successfully' });
});

module.exports = router;
