// ─── DRAG AND DROP REORDERING ─────────────────────────────────
// Lightweight drag-to-reorder using HTML5 Drag and Drop API
// Works on both desktop and touch (via pointer events fallback)

let dragSrc = null;
let dragContainer = null;
let onReorderCallback = null;

// Initialize drag sorting on a container element
// Items must have data-drag-id attribute
// Drag handles must have class 'drag-handle'
export function initDragSort(containerEl, onReorder) {
  if (!containerEl) return;
  onReorderCallback = onReorder;
  dragContainer = containerEl;

  // Add listeners to existing items
  refreshDragListeners(containerEl);
}

// Refresh listeners (call after adding new items)
export function refreshDragListeners(containerEl) {
  if (!containerEl) return;
  const items = containerEl.querySelectorAll('[data-drag-id]');

  items.forEach(item => {
    // Avoid double-binding
    item.removeEventListener('dragstart', onDragStart);
    item.removeEventListener('dragover', onDragOver);
    item.removeEventListener('dragleave', onDragLeave);
    item.removeEventListener('drop', onDrop);
    item.removeEventListener('dragend', onDragEnd);

    item.setAttribute('draggable', 'true');
    item.addEventListener('dragstart', onDragStart);
    item.addEventListener('dragover', onDragOver);
    item.addEventListener('dragleave', onDragLeave);
    item.addEventListener('drop', onDrop);
    item.addEventListener('dragend', onDragEnd);
  });
}

function onDragStart(e) {
  dragSrc = e.currentTarget;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragSrc.dataset.dragId);
  setTimeout(() => dragSrc?.classList.add('drag-ghost'), 0);
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const target = e.currentTarget;
  if (target === dragSrc) return;
  target.classList.add('drag-over');
}

function onDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

function onDrop(e) {
  e.preventDefault();
  const target = e.currentTarget;
  target.classList.remove('drag-over');
  if (!dragSrc || dragSrc === target) return;

  const container = target.parentElement;
  if (!container) return;

  // Get all draggable items in order
  const items = [...container.querySelectorAll('[data-drag-id]')];
  const srcIdx = items.indexOf(dragSrc);
  const tgtIdx = items.indexOf(target);

  if (srcIdx === -1 || tgtIdx === -1) return;

  // Reorder DOM
  if (srcIdx < tgtIdx) {
    container.insertBefore(dragSrc, target.nextSibling);
  } else {
    container.insertBefore(dragSrc, target);
  }

  // Build new order array
  const newItems = [...container.querySelectorAll('[data-drag-id]')];
  const newOrder = newItems.map((el, idx) => ({
    id: el.dataset.dragId,
    position: idx
  }));

  // Notify caller
  if (onReorderCallback) onReorderCallback(newOrder);
}

function onDragEnd(e) {
  dragSrc?.classList.remove('drag-ghost');
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  dragSrc = null;
}

// Add drag styles to stylesheet dynamically
const style = document.createElement('style');
style.textContent = `
  [data-drag-id] { transition: opacity .15s; }
  [data-drag-id].drag-ghost { opacity: .4; }
  [data-drag-id].drag-over {
    border-top: 2px solid var(--teal) !important;
  }
  .drag-handle { cursor: grab; }
  .drag-handle:active { cursor: grabbing; }
`;
document.head.appendChild(style);
