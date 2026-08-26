import { state, save } from './store.js';
import { openModal, closeModal } from './modal.js';
import { showToast } from './toast.js';
import { escapeHtml, formatDate } from './util.js';

let els = {};
let filters = { brightness: 'all', aspect: 'all', color: 'all', search: '' };

export function initAlbum() {
  els = {
    brightness: document.getElementById('filterBrightness'),
    aspect: document.getElementById('filterAspect'),
    color: document.getElementById('filterColor'),
    search: document.getElementById('albumSearch'),
    grid: document.getElementById('albumGrid'),
    empty: document.getElementById('albumEmpty')
  };

  els.brightness.addEventListener('change', () => { filters.brightness = els.brightness.value; renderAlbum(); });
  els.aspect.addEventListener('change', () => { filters.aspect = els.aspect.value; renderAlbum(); });
  els.color.addEventListener('change', () => { filters.color = els.color.value; renderAlbum(); });
  els.search.addEventListener('input', () => { filters.search = els.search.value.trim().toLowerCase(); renderAlbum(); });

  renderAlbum();
}

export function renderAlbum() {
  const items = state.album.filter((item) => {
    if (filters.brightness !== 'all' && item.brightnessLabel !== filters.brightness) return false;
    if (filters.aspect !== 'all' && item.aspectLabel !== filters.aspect) return false;
    if (filters.color !== 'all' && item.colorName !== filters.color) return false;
    if (filters.search) {
      const haystack = [
        ...(item.tags || []),
        item.exif?.make, item.exif?.model, item.colorName, item.aspectLabel, item.brightnessLabel
      ].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(filters.search)) return false;
    }
    return true;
  });

  els.empty.classList.toggle('hidden', items.length > 0);
  els.grid.innerHTML = items.map((item) => `
    <button type="button" class="album-thumb" data-id="${item.id}" style="background-image:url('${item.dataUrl}')">
      <span class="album-thumb-tag">${escapeHtml(item.aspectLabel)}</span>
    </button>
  `).join('');

  els.grid.querySelectorAll('.album-thumb').forEach((btn) => {
    btn.addEventListener('click', () => openDetail(btn.dataset.id));
  });
}

function openDetail(id) {
  const item = state.album.find((i) => i.id === id);
  if (!item) return;

  const exifRows = item.exif ? [
    ['Camera', [item.exif.make, item.exif.model].filter(Boolean).join(' ')],
    ['Aperture', item.exif.aperture],
    ['Shutter', item.exif.shutter],
    ['ISO', item.exif.iso],
    ['Focal length', item.exif.focalLength],
    ['Date taken', item.exif.dateTaken]
  ].filter(([, v]) => v) : [];

  openModal(`
    <img class="detail-image" src="${item.dataUrl}" alt="Saved reference">
    <div class="detail-meta">
      <span class="chip">${escapeHtml(item.aspectLabel)}</span>
      <span class="chip">${escapeHtml(item.brightnessLabel)}</span>
      <span class="chip">${escapeHtml(item.colorName)}</span>
      <span class="chip chip-muted">Saved ${escapeHtml(formatDate(item.savedAt))}</span>
    </div>
    <div class="swatch-row">
      ${(item.colors || []).map((hex) => `<span class="swatch-sm" style="background:${hex}" title="${hex}"></span>`).join('')}
    </div>
    ${item.tags && item.tags.length ? `<p class="tag-list">${item.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</p>` : ''}
    ${exifRows.length
      ? `<dl class="exif-list">${exifRows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join('')}</dl>`
      : '<p class="muted">No EXIF metadata found for this image.</p>'}
    <button type="button" class="btn btn-danger" id="deleteRefBtn">Delete from Album</button>
  `);

  document.getElementById('deleteRefBtn').addEventListener('click', () => {
    state.album = state.album.filter((i) => i.id !== id);
    save();
    closeModal();
    renderAlbum();
    showToast('Removed from Reference Album.');
    window.dispatchEvent(new CustomEvent('photowalk:stats-changed'));
  });
}
