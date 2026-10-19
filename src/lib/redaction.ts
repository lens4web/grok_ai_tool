const uuid = '[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}';
const videoObject = new RegExp(`^xai-video-${uuid}$`, 'i');
const imageObject = new RegExp(`^xai-tmp-imgen-${uuid}$`, 'i');

export function redactSecrets(value: unknown, secret?: string): unknown {
  if (typeof value === 'string') {
    const safe = secret ? value.split(secret).join('[redacted]') : value;
    let asset: URL | undefined;
    try {
      const url = new URL(safe);
      if (url.protocol === 'https:' && ['vidgen.x.ai', 'imgen.x.ai'].includes(url.hostname) && !url.username && !url.password && !url.port) asset = url;
    } catch { /* Not a URL. */ }
    // Preserve known CDN object names only in their path positions. A query
    // containing the same name must still be redacted.
    const pathStart = asset ? safe.indexOf(asset.pathname) : -1;
    return safe.replace(/(?:Bearer\s+\S+|xai-[A-Za-z0-9_-]{6,})/gi, (match: string, offset: number) => {
      if (asset && offset >= pathStart && offset + match.length <= pathStart + asset.pathname.length) {
        const segments = asset.pathname.split('/');
        if (asset.hostname === 'vidgen.x.ai' && (match === 'xai-vidgen-bucket' && segments.includes(match) || videoObject.test(match) && segments.includes(`${match}.mp4`))) return match;
        if (asset.hostname === 'imgen.x.ai' && (match === 'xai-imgen' && segments.includes(match) || imageObject.test(match) && ['jpg', 'jpeg', 'png', 'webp'].some(ext => segments.includes(`${match}.${ext}`)))) return match;
      }
      return '[redacted]';
    });
  }
  if (Array.isArray(value)) return value.map(item => redactSecrets(item, secret));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, /^(authorization|api[_-]?key|token|client_secret|cookie)$/i.test(key) ? '[redacted]' : redactSecrets(val, secret)]));
  return value;
}
