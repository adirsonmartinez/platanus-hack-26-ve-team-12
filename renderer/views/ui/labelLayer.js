// HTML labels that follow 3D points on screen (folder names, floors, the Supabase status, branches).
// Each label belongs to a view layer ('map' or 'git'); labels of the inactive layer are not shown.
export function createLabelLayer(container, sceneView) {
  const labels = new Set();
  let activeLayer = 'map';

  // align 'top': above the point; 'left': to its left, vertically centered; 'below': under it
  function add({ html = '', anchor = { x: 0, y: 0, z: 0 }, className = '', align = 'top', hidden = false, layer = 'map' }) {
    const el = document.createElement('div');
    el.className = `map-label ${className}`;
    el.innerHTML = html;
    el.hidden = hidden;
    el.classList.toggle('off-layer', layer !== activeLayer);
    container.appendChild(el);
    const label = {
      el,
      anchor: { ...anchor },
      align,
      layer,
      setAnchor(x, y, z) { Object.assign(this.anchor, { x, y, z }); },
      remove() { el.remove(); labels.delete(label); },
    };
    labels.add(label);
    return label;
  }

  function setActiveLayer(layer) {
    activeLayer = layer;
    labels.forEach((l) => l.el.classList.toggle('off-layer', l.layer !== layer));
  }

  // Call once per frame, after the views moved their anchors
  function update() {
    for (const { el, anchor, align, layer } of labels) {
      if (el.hidden || layer !== activeLayer) continue;
      const p = sceneView.toScreen(anchor);
      const shift = align === 'left' ? 'translate(calc(-100% - 8px), -50%)' : align === 'below' ? 'translate(-50%, 6px)' : 'translate(-50%, -100%)';
      el.style.transform = `translate(${p.x}px, ${p.y}px) ${shift}`;
    }
  }

  return { add, update, setActiveLayer };
}
