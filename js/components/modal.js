// ─── MODAL SYSTEM ─────────────────────────────────────────────

let activeModal = null;

export function openModal({ title, subtitle = '', body, footer, size = 'md', onClose }) {
  const container = document.getElementById('modal-container');
  if (!container) return;

  const sizeClass = { sm: 'modal-sm', md: 'modal-md', lg: 'modal-lg', xl: 'modal-xl' }[size] || 'modal-md';

  container.innerHTML = `
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal ${sizeClass}" role="dialog" aria-modal="true">
        <div class="modal-header">
          <div>
            <h2 class="modal-title">${title}</h2>
            ${subtitle ? `<p class="modal-subtitle">${subtitle}</p>` : ''}
          </div>

        </div>
        <div class="modal-body">${body}</div>
        ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
      </div>
    </div>`;

  activeModal = { onClose };

  // Close on overlay click
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') closeModal();
  });


  // Focus first input
  setTimeout(() => {
    const first = container.querySelector('input, select, textarea');
    if (first) first.focus();
  }, 50);
}

export function closeModal() {
  const container = document.getElementById('modal-container');
  if (!container) return;
  if (activeModal?.onClose) activeModal.onClose();
  container.innerHTML = '';
  activeModal = null;
}

export function isModalOpen() {
  return !!activeModal;
}

// Confirm dialog helper
export function confirmDialog({ title, message, confirmText = 'Confirm', confirmClass = 'btn-danger', onConfirm }) {
  openModal({
    title,
    size: 'sm',
    body: `<p class="confirm-message">${message}</p>`,
    footer: `
      <button class="btn btn-ghost" id="confirm-cancel">Cancel</button>
      <button class="btn ${confirmClass}" id="confirm-ok">${confirmText}</button>
    `
  });

  document.getElementById('confirm-cancel').addEventListener('click', closeModal);
  document.getElementById('confirm-ok').addEventListener('click', () => {
    closeModal();
    if (onConfirm) onConfirm();
  });
}
