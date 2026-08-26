let root = null;
let onCloseCb = null;

export function initModal(rootEl) {
  root = rootEl;
  root.addEventListener('click', (e) => {
    if (e.target === root || e.target.closest('[data-close-modal]')) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !root.classList.contains('hidden')) closeModal();
  });
}

export function openModal(innerHtml, { onClose } = {}) {
  onCloseCb = onClose || null;
  root.innerHTML = `<div class="modal-card">
    <button type="button" class="modal-close" data-close-modal aria-label="Close">&times;</button>
    ${innerHtml}
  </div>`;
  root.classList.remove('hidden');
}

export function closeModal() {
  root.classList.add('hidden');
  root.innerHTML = '';
  if (onCloseCb) onCloseCb();
  onCloseCb = null;
}
