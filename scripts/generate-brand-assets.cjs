// Rebuild committed assets from the editable vector mark. Sharp ships with Next.js.
const { readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const mark = readFileSync(path.join(root, 'src/app/icon.svg'), 'utf8');
const png = (svg, size) => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
const write = (file, data) => writeFileSync(path.join(root, file), data);

async function main() {
  for (const [file, size] of [['src/app/icon1.png', 96], ['public/app-icon-192.png', 192], ['public/app-icon-512.png', 512]]) write(file, await png(mark, size));
  write('src/app/apple-icon.png', await png(mark.replace('rx="16"', 'rx="0"'), 180));
  const masked = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#2563eb"/><svg x="64" y="64" width="384" height="384" viewBox="0 0 64 64">${mark.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')}</svg></svg>`;
  write('public/app-icon-maskable.png', await png(masked, 512));

  const sizes = [16, 32, 48, 64, 256];
  const images = await Promise.all(sizes.map(size => png(mark, size)));
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  images.forEach((data, i) => {
    const entry = 6 + i * 16, size = sizes[i];
    header[entry] = header[entry + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8); header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  write('src/app/favicon.ico', Buffer.concat([header, ...images]));

  const card = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <defs><linearGradient id="canvas" x2="1" y2="1"><stop stop-color="#080e1c"/><stop offset="1" stop-color="#172554"/></linearGradient></defs>
    <rect width="1200" height="630" fill="url(#canvas)"/>
    <circle cx="1100" cy="90" r="270" fill="#2563eb" opacity=".12"/><circle cx="1120" cy="550" r="200" fill="#a5f3fc" opacity=".04"/>
    <svg x="72" y="72" width="112" height="112" viewBox="0 0 64 64">${mark.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')}</svg>
    <g font-family="Arial, Helvetica, sans-serif">
      <text x="72" y="282" font-size="72" font-weight="700" fill="#f1f5fb">Grok Personal AI</text>
      <text x="76" y="354" font-size="36" fill="#bac6da">Text. Images. Video. Voice.</text>
      <text x="76" y="418" font-size="24" fill="#9cabc2">Your own xAI key. Your model settings.</text>
      <rect x="72" y="498" width="314" height="48" rx="24" fill="#1c2940"/>
      <text x="96" y="529" font-size="22" fill="#a5f3fc">grok.lens4web.com</text>
    </g>
  </svg>`;
  write('public/social-card.png', await sharp(Buffer.from(card)).png().toBuffer());
  console.log('Generated favicon, browser/device icons and 1200×630 social card.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
