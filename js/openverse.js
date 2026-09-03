// Optional real-photo examples for the Concept Explainer.
//
// The PRD flags "where do the reference photos come from without infringing
// copyright?" as an open question. This answers it narrowly: Openverse, filtered
// to CC0 and public-domain-mark results only, with attribution shown. It is
// strictly additive — offline, rate-limited, or blocked, the built-in vector
// diagrams are still the whole feature.

const ENDPOINT = 'https://api.openverse.org/v1/images/';
const PAGE_SIZE = 3;
const TIMEOUT_MS = 6000;

const cache = new Map();

/** Only https URLs, with quotes neutralised so they're safe inside CSS url(). */
export function safeImageUrl(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    return url.toString().replace(/'/g, '%27').replace(/"/g, '%22');
  } catch (err) {
    return null;
  }
}

export function fetchConceptPhotos(conceptKey, query) {
  const existing = cache.get(conceptKey);
  if (existing) return existing;

  const params = new URLSearchParams({
    q: query,
    license: 'cc0,pdm',
    page_size: String(PAGE_SIZE),
    mature: 'false'
  });

  const pending = withTimeout(`${ENDPOINT}?${params}`)
    .then((json) => (json.results || []).map((r) => ({
      thumbnail: r.thumbnail || r.url,
      title: r.title || 'Untitled',
      creator: r.creator || 'Unknown',
      license: String(r.license || '').toUpperCase(),
      source: r.foreign_landing_url || r.url
    })).filter((p) => p.thumbnail))
    .catch(() => []);

  cache.set(conceptKey, pending);
  // Don't let one offline moment permanently blank the strip for this session.
  pending.then((photos) => { if (!photos.length) cache.delete(conceptKey); });
  return pending;
}

function withTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal })
    .then((res) => {
      if (!res.ok) throw new Error('Openverse responded ' + res.status);
      return res.json();
    })
    .finally(() => clearTimeout(timer));
}
