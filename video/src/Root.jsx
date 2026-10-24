import { Composition, staticFile } from 'remotion';
import { PlatanusLaunch } from './PlatanusLaunch.jsx';
import { FPS, SIZE, plan } from './timing.js';

// The recording's markers and cursor decide how long each part lasts
async function calculateMetadata() {
  const [markers, cursor] = await Promise.all([
    fetch(staticFile('takes/raw/markers.json')).then((r) => r.json()),
    fetch(staticFile('takes/raw/cursor-path.json')).then((r) => r.json()),
  ]);
  const p = plan(markers);
  return { durationInFrames: p.total, props: { markers, cursor } };
}

export function Root() {
  return (
    <Composition
      id="PlatanusLaunch"
      component={PlatanusLaunch}
      durationInFrames={60 * FPS}
      fps={FPS}
      width={SIZE.width}
      height={SIZE.height}
      defaultProps={{ markers: null, cursor: [] }}
      calculateMetadata={calculateMetadata}
    />
  );
}
