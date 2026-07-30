const sanitizeHtml = require('sanitize-html');

const slugify = (value = '') => String(value)
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 200);

const sanitizeBlogHtml = (html = '') => sanitizeHtml(String(html), {
  allowedTags: ['p', 'br', 'h2', 'h3', 'strong', 'em', 'u', 'ul', 'ol', 'li', 'a', 'blockquote', 'hr', 'img'],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'data-alignment']
  },
  allowedSchemes: ['http', 'https'],
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }, true)
  }
});

const plainText = (html = '') => sanitizeHtml(String(html), { allowedTags: [], allowedAttributes: {} })
  .replace(/\s+/g, ' ').trim();

const readingTime = (html = '') => Math.max(1, Math.ceil(plainText(html).split(/\s+/).filter(Boolean).length / 200));

module.exports = { slugify, sanitizeBlogHtml, plainText, readingTime };
