// Remotion settings for the product video. three.js needs the ANGLE renderer; the robot comes from the
// app (renderer/views/scene/builders/robotBuilder.js), so "three" always resolves to this package's copy.
import path from 'node:path';
import { Config } from '@remotion/cli/config';

Config.setChromiumOpenGlRenderer('angle');
Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(92);
Config.setCodec('h264');
Config.setCrf(18);
Config.overrideWebpackConfig((config) => ({
  ...config,
  resolve: {
    ...config.resolve,
    alias: { ...(config.resolve?.alias ?? {}), three: path.resolve(process.cwd(), 'node_modules/three') },
  },
}));
