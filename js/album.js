import { state, save } from './store.js';
import { imageUrl, hydrateImages, deleteImage } from './db.js';
import { exifRows, analyzeStoredImage } from './analysis.js';
import { THEMES } from './concepts.js';
import { openModal, closeModal } from './modal.js';
import { showToast } from './toast.js';
import { escapeHtml, formatDate, navigateTo } from './util.js';

let els = {};
let filters = {
  brightness: 'all', aspect: 'all', color: 'all',
  focal: 'all', aperture: 'all', location: 'all', search: ''
};

export function initAlbum() {
  els = {
    brightness: document.getElementById('filterBrightness'),
    aspect: document.getElementById('filterAspect'),
    color: document.getElementById('filterColor'),
    focal: document.getElementById('filterFocal'),
    aperture: document.getElementById('filterAperture'),
    location: document.getElementById('filterLocation'),
    search: document.getElementById('albumSearch'),
    grid: document.getElementById('albumGrid'),
    empty: document.getElementById('albumEmpty')
  };

  ['brightness', 'aspect', 'color', 'focal', 'aperture', 'location'].forEach((key) => {
    els[key].addEventListener('change', () => { filters[key] = els[key].value; renderAlbum(); });
  });
  els.search.addEventListener('input', () => {
    filters.search = els.search.value.trim().toLowerCase();
    renderAlbum();
  });

  renderAlbum();
}

function matches(item) {
  if (filters.brightness !== 'all' && item.brightnessLabel !== filters.brightness) return false;
  if (filters.aspect !== 'all' && item.aspectLabel !== filters.aspect) return false;
  if (filters.color !== 'all' && item.colorName !== filters.color) return false;
  if (filters.focal !== 'all' && item.focalLabel !== filters.focal) return false;
  if (filters.aperture !== 'all' && item.apertureLabel !== filters.aperture) return false;
  if (filters.location === 'yes' && !item.hasLocation) return false;
  if (filters.location === 'no' && item.hasLocation) return false;
  if (filters.search) {
    const haystack = [
      ...(item.tags || []),
      ...(item.notes || []).map((n) => n.a),
      item.exif?.make, item.exif?.model, item.exif?.focalLength, item.exif?.aperture,
      item.colorName, item.aspectLabel, item.brightnessLabel, item.focalLabel, item.apertureLabel
    ].filter(Boolean).join(' ').toLowerCase();
    if (!haystack.includes(filters.search)) return false;
  }
  return true;
}

export function renderAlbum() {
  if (!els.grid) return;
  const items = state.album.filter(matches);

  els.empty.classList.toggle('hidden', items.length > 0);
  els.empty.textContent = state.album.length
    ? 'No references match these filters.'
    : 'No references yet — save one from the Analyze tab.';

  els.grid.innerHTML = items.map((item) => `
    <button type="button" class="album-thumb" data-id="${item.id}" data-image="${escapeHtml(item.imageId || '')}">
      <span class="album-thumb-tag">${escapeHtml(item.aspectLabel)}</span>
    </button>
  `).join('');

  hydrateImages(els.grid);
  els.grid.querySelectorAll('.album-thumb').forEach((btn) => {
    btn.addEventListener('click', () => openDetail(btn.dataset.id));
  });
}

async function openDetail(id) {
  const item = state.album.find((i) => i.id === id);
  if (!item) return;
  const url = await imageUrl(item.imageId);
  const rows = exifRows(item.exif);

  const walkTheme = item.themeId ? THEMES.find((t) => t.id === item.themeId) : null;
  const chips = [item.aspectLabel, item.brightnessLabel, item.colorName, item.focalLabel, item.apertureLabel]
    .filter(Boolean)
    .map((label) => `<span class="chip">${escapeHtml(label)}</span>`)
    .join('');

  const notes = (item.notes || []).filter((n) => n && n.a);

  openModal(`
    ${url ? `<img class="detail-image" src="${url}" alt="Saved reference">` : '<p class="muted">This photo is missing from storage.</p>'}
    <div class="detail-meta">
      ${chips}
      ${walkTheme ? `<span class="chip">Walk: ${escapeHtml(walkTheme.title)}</span>` : ''}
      <span class="chip chip-muted">Saved ${escapeHtml(formatDate(item.savedAt))}</span>
    </div>
    <div class="swatch-row">
      ${(item.colors || []).map((hex) => `<span class="swatch-sm" style="background:${escapeHtml(hex)}" title="${escapeHtml(hex)}"></span>`).join('')}
    </div>
    ${item.tags && item.tags.length ? `<p class="tag-list">${item.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</p>` : ''}
    ${notes.length ? `
      <h4 class="subsection-title">Your notes</h4>
      <dl class="exif-list notes-list">${notes.map((n) => `<dt>${escapeHtml(n.q)}</dt><dd>${escapeHtml(n.a)}</dd>`).join('')}</dl>` : ''}
    ${rows.length
      ? `<dl class="exif-list">${rows.join('')}</dl>`
      : '<p class="muted">No EXIF metadata found for this image.</p>'}
    ${url ? '<button type="button" class="btn btn-accent btn-block" id="analyzeRefBtn">Analyze this shot</button>' : ''}
    <button type="button" class="btn btn-danger" id="deleteRefBtn">Delete from Album</button>
  `);

  const analyzeBtn = document.getElementById('analyzeRefBtn');
  if (analyzeBtn) {
    analyzeBtn.addEventListener('click', () => {
      closeModal();
      navigateTo('analyze');
      analyzeStoredImage(item.imageId, {
        exif: item.exif || null,
        albumItemId: item.id,
        restore: {
          overlay: item.overlay || null,
          notes: item.notes || null,
          tags: item.tags || []
        }
      });
    });
  }

  document.getElementById('deleteRefBtn').addEventListener('click', async () => {
    state.album = state.album.filter((i) => i.id !== id);
    save();
    closeModal();
    renderAlbum();
    showToast('Removed from Reference Album.');
    window.dispatchEvent(new CustomEvent('photowalk:stats-changed'));
    if (item.imageId) await deleteImage(item.imageId).catch(() => {});
  });
}
