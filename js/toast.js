let container = null;

export function initToast(el) {
  container = el;
}

function dismiss(el) {
  if (!el.isConnected || !el.classList.contains('show')) return;
  el.classList.remove('show');
  setTimeout(() => el.remove(), 300);
}

export function showToast(message, duration = 4000) {
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');

  const text = document.createElement('span');
  text.className = 'toast-text';
  text.textContent = message;

  // A toast can sit over the very control you want to tap next, so let it be
  // closed right away instead of waiting out the timer.
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'toast-close';
  close.setAttribute('aria-label', 'Dismiss');
  close.textContent = '×';
  close.addEventListener('click', () => dismiss(el));

  el.append(text, close);
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => dismiss(el), duration);
}
