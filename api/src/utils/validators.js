function normalizeEmail(email) {
  return email ? email.toString().trim().toLowerCase() : '';
}

function isValidEmail(email) {
  const clean = normalizeEmail(email);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean);
}

function generateUniqueSlug(db, name) {
  const clean = (name || '').toString().trim();
  const baseSlug = clean.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'org';
  let slug = baseSlug;
  let counter = 1;

  while (db.prepare('SELECT id FROM organizations WHERE slug = ?').get(slug)) {
    slug = `${baseSlug}-${counter++}`;
  }

  return slug;
}

module.exports = {
  normalizeEmail,
  isValidEmail,
  generateUniqueSlug,
};
