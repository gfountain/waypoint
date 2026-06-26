// ─── DRAG SORT ────────────────────────────────────────────────

export function initDragSort(container, selector, onReorder) {
  const els = () => [...container.querySelectorAll(':scope > ' + selector)];

  els().forEach(item => {
    const handle = item.querySelector('.drag-handle');
    if (!handle) return;

    handle.addEventListener('mousedown', startDrag(item, container, els, onReorder));
  });
}

function startDrag(item, container, els, onReorder) {
  return function(e) {
    e.preventDefault();
    e.stopPropagation();

    let placeholder = document.createElement('div');
    placeholder.style.cssText = `height:${item.offsetHeight}px;background:var(--primary-lt);border:2px dashed var(--primary);border-radius:6px;margin:2px 0;box-sizing:border-box;pointer-events:none;`;
    item.parentNode.insertBefore(placeholder, item.nextSibling);
    item.style.opacity = '0.4';

    // Disable text selection globally
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';

    function onMove(e) {
      e.preventDefault();
      const siblings = els().filter(el => el !== item);
      let insertBefore = null;
      for (const sib of siblings) {
        const rect = sib.getBoundingClientRect();
        if (e.clientY < rect.top + rect.height / 2) {
          insertBefore = sib;
          break;
        }
      }
      if (insertBefore) {
        container.insertBefore(placeholder, insertBefore);
      } else {
        // append after last sibling
        const last = els()[els().length - 1];
        if (last && last !== item) {
          container.insertBefore(placeholder, last.nextSibling);
        }
      }
    }

    async function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
      document.body.style.webkitUserSelect = '';

      if (placeholder.parentNode) {
        placeholder.parentNode.insertBefore(item, placeholder);
        placeholder.remove();
      }
      item.style.opacity = '';

      const newOrder = els().map((el, idx) => ({
        id: el.dataset.dragId,
        position: idx
      }));
      if (onReorder) await onReorder(newOrder);
    }

    document.addEventListener('mousemove', onMove, { passive: false });
    document.addEventListener('mouseup', onUp);
  };
}
