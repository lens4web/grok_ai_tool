// Run against an already-started production server; no keys or paid API requests.
const assert = require('node:assert/strict');
const sharp = require('sharp');
const base = process.env.SEO_TEST_ORIGIN || 'http://127.0.0.1:3002';
const canonical = 'https://grok.lens4web.com/';
const decode = value => value.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const attrs = tag => Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => [key, decode(value)]));
async function get(path, headers = {}) {
  const response = await fetch(new URL(path, base), { headers, signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 200, `${path}: HTTP ${response.status}`);
  return response;
}
async function main() {
  for (const locale of ['en', 'ru', 'ar']) {
    const response = await get('/', { 'Accept-Language': locale, 'User-Agent': 'facebookexternalhit/1.1' });
    const html = await response.text(), head = html.match(/<head>([\s\S]*?)<\/head>/)?.[1];
    assert.ok(head, 'Social crawler receives head metadata');
    assert.ok(html.includes(`lang="${locale}"`));
    const tags = [...head.matchAll(/<(?:meta|link)\b[^>]*>/g)].map(([tag]) => attrs(tag));
    const value = key => tags.find(tag => tag.name === key || tag.property === key)?.content;
    assert.ok(value('description')?.includes('Grok'));
    assert.notEqual(value('description'), 'Personal web interface for Grok AI models');
    assert.equal(new URL(tags.find(tag => tag.rel === 'canonical')?.href).href, canonical);
    assert.equal(new URL(value('og:url')).href, canonical);
    assert.equal(value('og:image'), canonical + 'social-card.png');
    assert.equal(value('twitter:card'), 'summary_large_image');
    assert.ok(!value('robots')?.includes('noindex'));
    assert.ok(tags.some(tag => tag.rel === 'icon' && tag.type === 'image/png' && tag.sizes === '96x96'));
    assert.ok(tags.some(tag => tag.rel === 'apple-touch-icon' && tag.sizes === '180x180'));
    assert.ok(tags.some(tag => tag.rel === 'manifest'));
    const jsonScript = html.match(/<script\b([^>]*type="application\/ld\+json"[^>]*)>([\s\S]*?)<\/script>/);
    assert.ok(jsonScript);
    assert.equal(attrs(jsonScript[1]).nonce, response.headers.get('content-security-policy').match(/'nonce-([^']+)'/)[1]);
    const schema = JSON.parse(jsonScript[2]);
    assert.equal(schema['@type'], 'WebSite'); assert.equal(schema.url, canonical); assert.equal(schema.inLanguage, locale);
    assert.ok(html.includes('<main ') && html.includes('<h1 '));
    console.log(`PASS: ${locale} crawler metadata, canonical, social tags, icons, landmarks and JSON-LD nonce`);
  }
  const robots = await (await get('/robots.txt')).text();
  assert.match(robots, /Allow: \//); assert.match(robots, /Disallow: \/api\//); assert.ok(robots.includes(canonical + 'sitemap.xml'));
  const sitemap = await (await get('/sitemap.xml')).text();
  assert.equal((sitemap.match(/<loc>/g) || []).length, 1); assert.ok(sitemap.includes(`<loc>${canonical}</loc>`));
  const blocked = await fetch(new URL('/api/session', base));
  assert.equal(blocked.status, 403); assert.match(blocked.headers.get('x-robots-tag'), /noindex/);
  const manifest = await (await get('/manifest.webmanifest')).json();
  assert.equal(manifest.start_url, '/'); assert.equal(manifest.name, 'Grok Personal AI');
  for (const icon of manifest.icons) {
    const image = sharp(Buffer.from(await (await get(icon.src)).arrayBuffer()));
    const info = await image.metadata(); assert.equal(`${info.width}x${info.height}`, icon.sizes);
    if (icon.purpose === 'maskable') assert.ok((await image.stats()).isOpaque);
  }
  const card = await sharp(Buffer.from(await (await get('/social-card.png')).arrayBuffer())).metadata();
  assert.equal(card.width, 1200); assert.equal(card.height, 630);
  const ico = Buffer.from(await (await get('/favicon.ico')).arrayBuffer());
  assert.equal(ico.readUInt16LE(2), 1); assert.equal(ico.readUInt16LE(4), 5);
  for (let i = 0; i < 5; i++) {
    const entry = 6 + i * 16, bytes = ico.readUInt32LE(entry + 8), offset = ico.readUInt32LE(entry + 12);
    assert.ok(offset + bytes <= ico.length);
    const image = await sharp(ico.subarray(offset, offset + bytes)).metadata();
    assert.equal(image.width, ico[entry] || 256); assert.equal(image.height, ico[entry + 1] || 256);
  }
  console.log('PASS: robots/sitemap, API noindex, manifest, device icons, social card and all ICO frames');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
