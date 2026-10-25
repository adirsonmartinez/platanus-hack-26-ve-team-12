// Entry bundled by scripts/vendor-ui.js into renderer/vendor/react-ui.js (with one copy of React inside).
// border-beam and metal-fx (libraries.dev) are React components; the renderer is plain JS, so each is
// exposed as one function that wraps an element already in the page.
import { createElement, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { BorderBeam } from 'border-beam';
import { MetalFx, useMetalBend, isMetalFxSupported } from 'metal-fx';

// Renders `component` around `target`: the slot has no React children, so React never touches what we
// move into it. Returns { update(props), destroy() }.
function wrap(target, hostClass, render) {
  const host = document.createElement(target.tagName === 'BUTTON' ? 'span' : 'div');
  host.className = hostClass;
  target.before(host);
  const root = createRoot(host);
  let current = {};
  const draw = (props) => { current = { ...current, ...props }; root.render(render(current)); };
  return {
    host,
    root,
    mount(props) { flushSync(() => draw(props)); host.querySelector('.fx-slot').appendChild(target); },
    update: draw,
    destroy() { host.before(target); root.unmount(); host.remove(); },
  };
}

// Wraps `target` (already in the page) in a BorderBeam.
export function mountBorderBeam(target, props = {}) {
  const w = wrap(target, 'beam-host', (p) => createElement(BorderBeam, p, createElement('div', { className: 'beam-slot fx-slot' })));
  w.mount(props);
  return { update: w.update, destroy: w.destroy };
}

// The circle of liquid metal around a round icon button, bending toward the cursor
function MetalCircle({ reflect, ...props }) {
  const ref = useRef(null);
  useMetalBend(ref);
  const targets = reflect ? [{ current: reflect }] : undefined;
  return createElement(MetalFx, { ref, variant: 'circle', preset: 'chromatic', innerShadow: true, strength: 0.9, theme: 'dark', reflectionTargets: targets, ...props },
    createElement('span', { className: 'metal-slot fx-slot' }));
}

// Wraps a round button in liquid metal. reflect: a neighbour that catches the reflection (the model
// picker). Without WebGL2 the button stays as it is. Returns { update(props), destroy() } or null.
export function mountMetalButton(target, { reflect = null, ...props } = {}) {
  if (!isMetalFxSupported()) return null;
  const w = wrap(target, 'metal-host', (p) => createElement(MetalCircle, p));
  w.mount({ reflect, ...props });
  return { update: w.update, destroy: w.destroy };
}
