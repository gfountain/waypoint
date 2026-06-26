// ─── DRAG SORT ────────────────────────────────────────────────
// Prevents text selection, saves order to DB on drop

export function initDragSort(container, selector, onReorder) {
  let dragging = null;
  let placeholder = null;

  const getItems = () => [...container.querySelectorAll(selector)];

  container.querySelectorAll(selector).forEach(item => {
    const handle = item.querySelector('.drag-handle');
    if (!handle) return;

    handle.addEventListener('mousedown', e => {
      e.preventDefault(); // prevent text selection
      dragging = item;

      // Create placeholder
      placeholder = document.createElement('div');
      placeholder.style.cssText = `height:${item.offsetHeight}px;background:var(--primary-lt);border:2px dashed var(--primary);border-radius:var(--radius);margin-bottom:2px;opacity:.6`;
      item.parentNode.insertBefore(placeholder, item.nextSibling);

      item.style.opacity = '0.5';
      item.style.position = 'relative';
      item.style.zIndex = '100';

      const onMove = e => {
        const items = getItems().filter(i => i !== dragging);
        let insertBefore = null;
        for (const other of items) {
          const rect = other.getBoundingClientRect();
          if (e.clientY < rect.top + rect.height / 2) {
            insertBefore = other;
            break;
          }
        }
        if (insertBefore) {
          container.insertBefore(placeholder, insertBefore);
        } else {
          container.appendChild(placeholder);
        }
      };

      const onUp = async () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);

        if (dragging && placeholder) {
          container.insertBefore(dragging, placeholder);
          placeholder.remove();
          dragging.style.opacity = '';
          dragging.style.position = '';
          dragging.style.zIndex = '';

          // Get new order
          const newOrder = getItems().map((el, idx) => ({
            id: el.dataset.dragId,
            position: idx
          }));
          if (onReorder) await onReorder(newOrder);
        }
        dragging = null;
        placeholder = null;
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });
}
