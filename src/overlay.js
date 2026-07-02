// Ref-counted flag for open modals/pop-ups. While any overlay is open we set
// body[data-modal-open] so the dashboard's arrow-key slide navigation ignores
// arrows. We do NOT freeze the page scroll — the modals contain their own
// scroll (overscroll-behavior: contain) so the wheel scrolls the modal, not the
// background, without needing a click. Ref-counted so nested overlays behave.
let count = 0

export function lockBackground() {
  count++
  document.body.dataset.modalOpen = '1'
}

export function unlockBackground() {
  count = Math.max(0, count - 1)
  if (count === 0) delete document.body.dataset.modalOpen
}
