// Electron's did-start-loading includes child frames. Lazy-loaded widgets can
// fire it during scrolling without navigating the visible document. Never put
// an opaque, full-page loading mask over an already usable official page then.
export function observeOfficialDocumentLoading(view: EventTarget, update: (state: { loading: boolean; ready: boolean }) => void) {
  let ready = false;
  const navigation = (raw: Event) => {
    const event = raw as Event & { isMainFrame?: boolean; isInPlace?: boolean };
    if (event.isMainFrame && !event.isInPlace) { ready = false; update({ loading: true, ready: false }); }
  };
  const loaded = () => { ready = true; update({ loading: false, ready: true }); };
  const stopped = () => { if (ready) update({ loading: false, ready: true }); };
  const failed = (raw: Event) => {
    const event = raw as Event & { isMainFrame?: boolean; errorCode?: number };
    if (event.isMainFrame !== false && event.errorCode !== -3) { ready = false; update({ loading: false, ready: false }); }
  };
  view.addEventListener('did-start-navigation', navigation);
  view.addEventListener('dom-ready', loaded);
  view.addEventListener('did-stop-loading', stopped);
  view.addEventListener('did-fail-load', failed);
  return () => {
    view.removeEventListener('did-start-navigation', navigation);
    view.removeEventListener('dom-ready', loaded);
    view.removeEventListener('did-stop-loading', stopped);
    view.removeEventListener('did-fail-load', failed);
  };
}
