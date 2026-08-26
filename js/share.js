import { state, broadcast, reloadRoomsFromDisk, bus } from './store.js';
import { openModal } from './modal.js';
import { showToast } from './toast.js';
import { escapeHtml, uid, roomCode, formatTime, readFileAsDataUrl, loadImage, drawToCanvas } from './util.js';

let els = {};

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
    nameInput: document.getElementById('uploaderNameInput'),
    photoInput: document.getElementById('roomPhotoInput'),
    noteInput: document.getElementById('roomNoteInput'),
    uploadBtn: document.getElementById('uploadToRoomBtn'),
    photosGrid: document.getElementById('roomPhotosGrid'),
    photosEmpty: document.getElementById('roomPhotosEmpty')
  };

  els.createBtn.addEventListener('click', createRoom);
  els.joinBtn.addEventListener('click', () => joinRoom(els.joinCodeInput.value));
  els.copyBtn.addEventListener('click', copyInvite);
  els.leaveBtn.addEventListener('click', leaveRoom);
  els.uploadBtn.addEventListener('click', uploadPhoto);

  if (bus) {
    bus.addEventListener('message', () => {
      reloadRoomsFromDisk();
      renderShare();
    });
  }

  renderShare();
}

export function renderShare() {
  const room = state.currentRoom ? state.rooms[state.currentRoom] : null;
  els.joinSection.classList.toggle('hidden', !!room);
  els.roomSection.classList.toggle('hidden', !room);
  if (!room) return;

  els.codeDisplay.textContent = room.code;
  els.roomTheme.textContent = room.theme ? `Theme: ${room.theme}` : 'No theme set';

  const photos = room.photos || [];
  els.photosEmpty.classList.toggle('hidden', photos.length > 0);
  els.photosGrid.innerHTML = photos.slice().reverse().map((p) => `
    <button type="button" class="room-thumb" data-id="${p.id}" style="background-image:url('${p.dataUrl}')">
      <span class="room-thumb-name">${escapeHtml(p.name)}</span>
    </button>
  `).join('');

  els.photosGrid.querySelectorAll('.room-thumb').forEach((btn) => {
    btn.addEventListener('click', () => openPhotoDetail(room.code, btn.dataset.id));
  });
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
  showToast(`Room ${code} created — share the code with your walk partners.`);
}

function joinRoom(rawCode) {
  const code = rawCode.trim().toUpperCase();
  els.error.textContent = '';
  if (!code) { els.error.textContent = 'Enter a room code.'; return; }
  if (!state.rooms[code]) {
    els.error.textContent = 'Room not found on this device. This demo simulates sharing across tabs of the same browser — connect a backend for real multi-device rooms.';
    return;
  }
  state.currentRoom = code;
  els.joinCodeInput.value = '';
  broadcast('room-joined', { code });
  renderShare();
}

function leaveRoom() {
  state.currentRoom = null;
  broadcast('room-left', {});
  renderShare();
}

function copyInvite() {
  const room = state.rooms[state.currentRoom];
  if (!room) return;
  const text = `Join my PhotoWalk room with code ${room.code}`;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => showToast('Invite copied to clipboard.')).catch(() => showToast(`Code: ${room.code}`));
  } else {
    showToast(`Code: ${room.code}`);
  }
}

async function uploadPhoto() {
  const room = state.rooms[state.currentRoom];
  const file = els.photoInput.files && els.photoInput.files[0];
  if (!room || !file) { showToast('Choose a photo to upload first.'); return; }

  const name = els.nameInput.value.trim() || 'Anonymous';
  const dataUrl = await readFileAsDataUrl(file);
  const img = await loadImage(dataUrl);
  const canvas = drawToCanvas(img, 900);

  room.photos.push({
    id: uid(),
    name,
    note: els.noteInput.value.trim(),
    dataUrl: canvas.toDataURL('image/jpeg', 0.82),
    ts: Date.now(),
    comments: []
  });

  els.photoInput.value = '';
  els.noteInput.value = '';
  broadcast('photo-uploaded', { code: room.code });
  renderShare();
  showToast('Shared with the room.');
}

function openPhotoDetail(code, photoId) {
  const room = state.rooms[code];
  const photo = room && room.photos.find((p) => p.id === photoId);
  if (!photo) return;

  openModal(`
    <img class="detail-image" src="${photo.dataUrl}" alt="Shared by ${escapeHtml(photo.name)}">
    <div class="detail-meta">
      <span class="chip">${escapeHtml(photo.name)}</span>
      <span class="chip chip-muted">${escapeHtml(formatTime(photo.ts))}</span>
    </div>
    ${photo.note ? `<p class="muted">${escapeHtml(photo.note)}</p>` : ''}
    <div class="comment-list" id="commentList"></div>
    <form id="commentForm" class="comment-form">
      <input type="text" id="commentName" placeholder="Your name" maxlength="30">
      <input type="text" id="commentText" placeholder="Add a comment" maxlength="200">
      <button type="submit" class="btn btn-accent">Post</button>
    </form>
  `);

  renderComments(photo);

  document.getElementById('commentForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('commentName').value.trim() || 'Anonymous';
    const text = document.getElementById('commentText').value.trim();
    if (!text) return;
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
