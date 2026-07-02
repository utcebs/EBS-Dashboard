// Ref-counted background lock for modals/pop-ups. While any overlay is open we
// set body[data-modal-open] (so the dashboard's arrow-key slide navigation
// ignores keys) and freeze background scroll. Ref-counted so nested overlays
// don't unlock the background early.
let count = 0

export function lockBackground() {
  count++
  document.body.dataset.modalOpen = '1'
  document.body.style.overflow = 'hidden'
}

export function unlockBackground() {
  count = Math.max(0, count - 1)
  if (count === 0) {
    delete document.body.dataset.modalOpen
    document.body.style.overflow = ''
  }
}
