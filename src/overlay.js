// Ref-counted background lock for modals/pop-ups. While any overlay is open we
// set body[data-modal-open] (so the dashboard's arrow-key slide navigation
// ignores keys) and freeze the scroll container. This app scrolls on the
// <main id="main-scroll"> element (not the body/window), so that's what we
// freeze. Ref-counted so nested overlays don't unlock the background early.
let count = 0

function scroller() {
  return document.getElementById('main-scroll')
}

export function lockBackground() {
  count++
  document.body.dataset.modalOpen = '1'
  const s = scroller()
  if (s) s.style.overflow = 'hidden'
  document.body.style.overflow = 'hidden' // fallback if the layout ever changes
}

export function unlockBackground() {
  count = Math.max(0, count - 1)
  if (count === 0) {
    delete document.body.dataset.modalOpen
    const s = scroller()
    if (s) s.style.overflow = ''
    document.body.style.overflow = ''
  }
}
