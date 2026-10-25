// Recording mode for the product video (PLATANUS_DEMO=1 loads index.html?demo=1; scripts/demo/): the
// cursor is drawn inside the page so the recording shows it. Off in normal use.
export const isDemo = (() => {
  try { return new URLSearchParams(location.search).get('demo') === '1'; } catch { return false; }
})();
