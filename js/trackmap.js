/**
 * The waypoint map on the Field HUD.
 *
 * Rather than pull in a mapping library, this fetches OpenStreetMap raster
 * tiles directly (the tile maths is about thirty lines) and draws the GPS
 * polyline over them on a canvas. Tiles are cached by the service worker, so a
 * route you have already walked keeps rendering offline.
 *
 * If tiles can't be reached the map degrades to a sensor-grid backdrop with the
 * track still drawn on it — the useful part is the shape of the walk, not the
 * street names.
 */

const TILE = 256;
const TILE_HOST = 'https://tile.openstreetmap.org';

const tileCache = new Map();

function loadTile(z, x, y) {
  const key = `${z}/${x}/${y}`;
  let pending = tileCache.get(key);
  if (!pending) {
    pending = new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = `${TILE_HOST}/${z}/${x}/${y}.png`;
    });
    tileCache.set(key, pending);
  }
  return pending;
}

/* ---------- Web Mercator ---------- */

const lonToX = (lon, z) => ((lon + 180) / 360) * Math.pow(2, z);

function latToY(lat, z) {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, z);
}

/** The largest zoom at which the whole track still fits the canvas. */
function fitZoom(bounds, widthPx, heightPx) {
  for (let z = 18; z >= 2; z--) {
    const w = (lonToX(bounds.east, z) - lonToX(bounds.west, z)) * TILE;
    const h = (latToY(bounds.south, z) - latToY(bounds.north, z)) * TILE;
    if (w <= widthPx && h <= heightPx) return z;
  }
  return 2;
}

function boundsOf(points) {
  let north = -90, south = 90, east = -180, west = 180;
  for (const p of points) {
    north = Math.max(north, p.lat);
    south = Math.min(south, p.lat);
    east = Math.max(east, p.lon);
    west = Math.min(west, p.lon);
  }
  // A single point (or a very short track) has no extent; give it ~250 m.
  const padLat = Math.max((north - south) * 0.25, 0.0011);
  const padLon = Math.max((east - west) * 0.25, 0.0015);
  return { north: north + padLat, south: south - padLat, east: east + padLon, west: west - padLon };
}

/* ---------- Drawing ---------- */

function drawGrid(ctx, w, h) {
  ctx.fillStyle = '#0c0e13';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(42, 46, 57, 0.9)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= w; x += 24) {
    ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke();
  }
  for (let y = 0; y <= h; y += 24) {
    ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke();
  }
}

function drawEmpty(ctx, w, h, message) {
  drawGrid(ctx, w, h);
  ctx.fillStyle = '#9ca3af';
  ctx.font = '500 12px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(message, w / 2, h / 2);
}

/**
 * Renders `track` (and any `pins`) into `canvas`. Safe to call on every GPS
 * update: tiles are memoised, and the polyline is cheap.
 */
export async function drawTrack(canvas, track, pins = []) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cssW = canvas.clientWidth || 320;
  const cssH = canvas.clientHeight || 180;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const points = track && track.length ? track : [];
  if (!points.length) {
    drawEmpty(ctx, cssW, cssH, 'Start GPS tracking to draw your route');
    return;
  }

  const bounds = boundsOf(points);
  const z = fitZoom(bounds, cssW, cssH);
  const centreX = (lonToX(bounds.west, z) + lonToX(bounds.east, z)) / 2;
  const centreY = (latToY(bounds.north, z) + latToY(bounds.south, z)) / 2;

  // Canvas pixel for a lat/lon at this zoom and centre.
  const project = (p) => ({
    x: (lonToX(p.lon, z) - centreX) * TILE + cssW / 2,
    y: (latToY(p.lat, z) - centreY) * TILE + cssH / 2
  });

  drawGrid(ctx, cssW, cssH);

  // Every tile that overlaps the viewport.
  const first = { x: Math.floor(centreX - cssW / 2 / TILE), y: Math.floor(centreY - cssH / 2 / TILE) };
  const last = { x: Math.floor(centreX + cssW / 2 / TILE), y: Math.floor(centreY + cssH / 2 / TILE) };
  const span = Math.pow(2, z);
  const jobs = [];
  for (let tx = first.x; tx <= last.x; tx++) {
    for (let ty = first.y; ty <= last.y; ty++) {
      if (ty < 0 || ty >= span) continue;
      const wrapped = ((tx % span) + span) % span;
      jobs.push(loadTile(z, wrapped, ty).then((img) => ({
        img,
        x: (tx - centreX) * TILE + cssW / 2,
        y: (ty - centreY) * TILE + cssH / 2
      })));
    }
  }

  const tiles = await Promise.all(jobs);
  // Darkroom-safe: OSM tiles are bright, so knock them back under the HUD.
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.filter = 'grayscale(1) brightness(0.55) contrast(1.1)';
  for (const t of tiles) if (t.img) ctx.drawImage(t.img, t.x, t.y, TILE, TILE);
  ctx.restore();

  // Route.
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  points.forEach((p, i) => {
    const { x, y } = project(p);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Pinned waypoints.
  ctx.fillStyle = '#4cd7f6';
  for (const pin of pins) {
    const { x, y } = project(pin);
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Current position, last so it sits on top.
  const here = project(points[points.length - 1]);
  ctx.fillStyle = '#f59e0b';
  ctx.strokeStyle = '#0c0e13';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(here.x, here.y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Attribution is a licence condition of using OSM tiles.
  ctx.fillStyle = 'rgba(226, 226, 233, 0.55)';
  ctx.font = '400 9px ui-monospace, monospace';
  ctx.textAlign = 'right';
  ctx.fillText('© OpenStreetMap', cssW - 6, cssH - 5);
}
