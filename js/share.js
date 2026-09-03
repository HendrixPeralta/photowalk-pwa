import { state, broadcast, reloadRoomsFromDisk, bus, setDisplayName, warnIfStorageTight } from './store.js';
import { putImage, imageUrl, hydrateImages } from './db.js';
import { qrSvg } from './qr.js';
import { openModal, closeModal } from './modal.js';
import { showToast } from './toast.js';
import { analyzeStoredImage } from './analysis.js';
import { escapeHtml, uid, roomCode, formatTime, loadImage, readFileAsDataUrl, drawToCanvas, canvasToBlob, navigateTo } from './util.js';

const ROOM_MAX_DIM = 900;

let els = {};
// Photos handed to us by the OS share sheet, waiting to be posted to a room.
let sharedFiles = [];

export function initShare() {
  els = {
    joinSection: document.getElementById('shareJoinSection'),
    roomSection: document.getElementById('shareRoomSection'),
    themeInput: document.getElementById('roomThemeInput'),
    createBtn: document.getElementById('createRoomBtn'),
    joinCodeInput: document.getElementById('joinCodeInput'),
    joinBtn: document.getElementById('joinRoomBtn'),
    error: document.getElementById('shareError'),
    codeDisplay: document.getElementById('roomCodeDisplay'),
    roomTheme: document.getElementById('roomThemeDisplay'),
    copyBtn: document.getElementById('copyInviteBtn'),
    leaveBtn: document.getElementById('leaveRoomBtn'),
    qr: document.getElementById('roomQr'),
    inviteLink: document.getElementById('roomInviteLink'),
    nameInput: document.getElementById('uploaderNameInput'),
    photoInput: document.getElementById('roomPhotoInput'),
    noteInput: document.getElementById('roomNoteInput'),
    uploadBtn: document.getElementById('uploadToRoomBtn'),
    sharedNotice: document.getElementById('sharedFilesNotice'),
    photosGrid: document.getElementById('roomPhotosGrid'),
    photosEmpty: document.getElementById('roomPhotosEmpty')
  };

  els.nameInput.value = state.profile.displayName;
  els.nameInput.addEventListener('change', () => setDisplayName(els.nameInput.value));

  els.createBtn.addEventListener('click', createRoom);
  els.joinBtn.addEventListener('click', () => joinRoom(els.joinCodeInput.value));
  els.joinCodeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom(els.joinCodeInput.value); });
  els.copyBtn.addEventListener('click', copyInvite);
  els.leaveBtn.addEventListener('click', leaveRoom);
  els.uploadBtn.addEventListener('click', uploadPhotos);
  els.photoInput.addEventListener('change', () => { sharedFiles = []; renderSharedNotice(); });

  if (bus) {
    bus.addEventListener('message', () => {
      reloadRoomsFromDisk();
      renderShare();
    });
  }

  renderShare();
}

/** The URL a partner can open to land straight in this room. */
function inviteUrl(code) {
  const url = new URL(window.location.href);
  url.hash = '';
  url.search = `?room=${encodeURIComponent(code)}`;
  return url.toString();
}

export function renderShare() {
  if (!els.joinSection) return;
  const room = state.currentRoom ? state.rooms[state.currentRoom] : null;
  els.joinSection.classList.toggle('hidden', !!room);
  els.roomSection.classList.toggle('hidden', !room);
  renderSharedNotice();
  if (!room) return;

  els.codeDisplay.textContent = room.code;
  els.roomTheme.textContent = room.theme ? `Theme: ${room.theme}` : 'No theme set';

  const link = inviteUrl(room.code);
  els.inviteLink.textContent = link;
  try {
    els.qr.innerHTML = qrSvg(link, { moduleSize: 4, quiet: 3 });
  } catch (err) {
    // Only happens for absurdly long origins; the code and link still work.
    els.qr.innerHTML = '';
  }

  const photos = room.photos || [];
  els.photosEmpty.classList.toggle('hidden', photos.length > 0);
  els.photosGrid.innerHTML = photos.slice().reverse().map((p) => `
    <button type="button" class="room-thumb" data-id="${escapeHtml(p.id)}" data-image="${escapeHtml(p.imageId || '')}">
      <span class="room-thumb-name">${escapeHtml(p.name)}</span>
    </button>
  `).join('');

  hydrateImages(els.photosGrid);
  els.photosGrid.querySelectorAll('.room-thumb').forEach((btn) => {
    btn.addEventListener('click', () => openPhotoDetail(room.code, btn.dataset.id));
  });
}

function renderSharedNotice() {
  if (!els.sharedNotice) return;
  els.sharedNotice.classList.toggle('hidden', sharedFiles.length === 0);
  if (!sharedFiles.length) return;

  const count = sharedFiles.length === 1 ? '1 photo' : `${sharedFiles.length} photos`;
  // The notice sits outside the room card so it's still visible (and explains
  // what to do next) when the share sheet hands us photos before there's a room.
  els.sharedNotice.textContent = state.currentRoom
    ? `${count} ready from your share sheet — press Upload to post them.`
    : `${count} ready from your share sheet — create or join a room to post them.`;
}

/** Called on boot when the OS share sheet handed PhotoWalk some images. */
export function attachSharedFiles(files) {
  sharedFiles = files.filter(Boolean);
  renderSharedNotice();
}

export function hasSharedFiles() {
  return sharedFiles.length > 0;
}

function createRoom() {
  const code = roomCode();
  state.rooms[code] = {
    code,
    theme: els.themeInput.value.trim(),
    createdAt: Date.now(),
    photos: []
  };
  state.currentRoom = code;
  els.themeInput.value = '';
  broadcast('room-created', { code });
  renderShare();
  showToast(`Room ${code} created — share the code or QR with your walk partners.`);
}

export function joinRoom(rawCode, { quiet = false } = {}) {
  const code = String(rawCode || '').trim().toUpperCase();
  if (els.error) els.error.textContent = '';
  if (!code) {
    if (!quiet && els.error) els.error.textContent = 'Enter a room code.';
    return false;
  }
  if (!state.rooms[code]) {
    const message = 'Room not found on this device. This demo simulates sharing across tabs of the '
      + 'same browser — connect a backend for real multi-device rooms.';
    if (quiet) showToast(message, 6000);
    else if (els.error) els.error.textContent = message;
    return false;
  }
  state.currentRoom = code;
  if (els.joinCodeInput) els.joinCodeInput.value = '';
  broadcast('room-joined', { code });
  renderShare();
  return true;
}

function leaveRoom() {
  state.currentRoom = null;
  broadcast('room-left', {});
  renderShare();
}

function copyInvite() {
  const room = state.rooms[state.currentRoom];
  if (!room) return;
  const text = inviteUrl(room.code);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => showToast('Invite link copied to clipboard.'))
      .catch(() => showToast(`Code: ${room.code}`));
  } else {
    showToast(`Code: ${room.code}`);
  }
}

async function uploadPhotos() {
  const room = state.rooms[state.currentRoom];
  const files = sharedFiles.length ? sharedFiles : Array.from(els.photoInput.files || []);
  if (!room) {
    showToast('Create or join a room first, then upload.');
    return;
  }
  if (!files.length) {
    showToast('Choose at least one photo to upload first.');
    return;
  }

  const name = els.nameInput.value.trim() || 'Anonymous';
  setDisplayName(name);
  const note = els.noteInput.value.trim();

  els.uploadBtn.disabled = true;
  let saved = 0;
  try {
    for (const file of files) {
      let canvas;
      try {
        canvas = drawToCanvas(await loadImage(await readFileAsDataUrl(file)), ROOM_MAX_DIM);
      } catch (err) {
        continue; // one unreadable file shouldn't abandon the rest of the batch
      }
      const imageId = uid();
      await putImage(imageId, await canvasToBlob(canvas, 'image/jpeg', 0.82));
      room.photos.push({
        id: uid(),
        imageId,
        name,
        note,
        ts: Date.now(),
        comments: [],
        // Stamped so partners can see which walk theme a shot was made under.
        themeId: state.activeWalk ? state.activeWalk.themeId : null
      });
      saved++;
    }

    if (!saved) {
      showToast('None of those files could be read as images.');
      return;
    }

    els.photoInput.value = '';
    els.noteInput.value = '';
    sharedFiles = [];
    broadcast('photo-uploaded', { code: room.code });
    renderShare();
    showToast(saved === 1 ? 'Shared with the room.' : `Shared ${saved} shots with the room.`);
    warnIfStorageTight();
  } catch (err) {
    console.warn('PhotoWalk: upload failed.', err);
    showToast('Could not share that photo — your device may be out of storage.');
  } finally {
    els.uploadBtn.disabled = false;
  }
}

async function openPhotoDetail(code, photoId) {
  const room = state.rooms[code];
  const photo = room && room.photos.find((p) => p.id === photoId);
  if (!photo) return;
  const url = await imageUrl(photo.imageId);

  openModal(`
    ${url ? `<img class="detail-image" src="${url}" alt="Shared by ${escapeHtml(photo.name)}">` : ''}
    <div class="detail-meta">
      <span class="chip">${escapeHtml(photo.name)}</span>
      <span class="chip chip-muted">${escapeHtml(formatTime(photo.ts))}</span>
    </div>
    ${photo.note ? `<p class="muted">${escapeHtml(photo.note)}</p>` : ''}
    ${url ? '<button type="button" class="btn btn-primary btn-block" id="analyzeRoomPhotoBtn">Analyze this shot</button>' : ''}
    <div class="comment-list" id="commentList"></div>
    <form id="commentForm" class="comment-form">
      <input type="text" id="commentName" placeholder="Your name" maxlength="30" value="${escapeHtml(state.profile.displayName)}">
      <input type="text" id="commentText" placeholder="Add a comment" maxlength="200">
      <button type="submit" class="btn btn-accent">Post</button>
    </form>
  `);

  renderComments(photo);

  const analyzeBtn = document.getElementById('analyzeRoomPhotoBtn');
  if (analyzeBtn) {
    analyzeBtn.addEventListener('click', () => {
      closeModal();
      navigateTo('analyze');
      analyzeStoredImage(photo.imageId);
    });
  }

  document.getElementById('commentForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('commentName').value.trim() || 'Anonymous';
    const text = document.getElementById('commentText').value.trim();
    if (!text) return;
    setDisplayName(name);
    photo.comments.push({ name, text, ts: Date.now() });
    broadcast('comment-added', { code });
    renderComments(photo);
    document.getElementById('commentText').value = '';
    renderShare();
  });
}

function renderComments(photo) {
  const list = document.getElementById('commentList');
  if (!list) return;
  list.innerHTML = (photo.comments || []).map((c) => `
    <p class="comment"><strong>${escapeHtml(c.name)}</strong> ${escapeHtml(c.text)}</p>
  `).join('') || '<p class="muted">No comments yet — be the first.</p>';
}
