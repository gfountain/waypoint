// ─── DRAG SORT ────────────────────────────────────────────────

export function initDragSort(container, selector, onReorder) {
  let dragging = null;
  let placeholder = null;
  let startY = 0;

  const els = () => [...container.querySelectorAll(selector)];

  container.querySelectorAll(selector).forEach(item => {
    const handle = item.querySelector('.drag-handle');
    if (!handle) return;

    handle.style.cursor = 'grab';

    handle.addEventListener('mousedown', e => {
      e.preventDefault();
      e.stopPropagation();
      startY = e.clientY;
      dragging = item;

      // Disable text selection globally during drag
      document.body.style.userSelect = 'none';
      document.body.style.webkitUserSelect = 'none';

      // Create placeholder matching item height
      placeholder = document.createElement('div');
      placeholder.style.cssText = `
        height: ${item.offsetHeight}px;
        background: var(--primary-lt);
        border: 2px dashed var(--primary);
        border-radius: 6px;
        margin: 2px 0;
        pointer-events: none;
      `;

      item.parentNode.insertBefore(placeholder, item.nextSibling);
      item.style.opacity = '0.4';
      handle.style.cursor = 'grabbing';

      const onMouseMove = e => {
        e.preventDefault();
        const siblings = els().filter(el => el !== dragging);
        let insertBefore = null;
        for (const sib of siblings) {
          const rect = sib.getBoundingClientRect();
          if (e.clientY < rect.top + rect.height / 2) {
            insertBefore = sib;
            break;
          }
        }
        if (insertBefore && insertBefore !== placeholder) {
          container.insertBefore(placeholder, insertBefore);
        } else if (!insertBefore) {
          const parent = placeholder.parentNode;
          if (parent) parent.appendChild(placeholder);
        }
      };

      const onMouseUp = async () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);

        // Re-enable text selection
        document.body.style.userSelect = '';
        document.body.style.webkitUserSelect = '';

        if (dragging && placeholder && placeholder.parentNode) {
          placeholder.parentNode.insertBefore(dragging, placeholder);
          placeholder.remove();
        }

        dragging.style.opacity = '';
        handle.style.cursor = 'grab';

        const newOrder = els().map((el, idx) => ({
          id: el.dataset.dragId,
          position: idx
        }));

        if (onReorder) await onReorder(newOrder);
        dragging = null;
        placeholder = null;
      };

      document.addEventListener('mousemove', onMouseMove, { passive: false });
      document.addEventListener('mouseup', onMouseUp);
    });
  });
}
