// build-editor.js - Bundle TipTap editor with esbuild
const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['src/editor.js'],
  bundle: true,
  minify: true,
  outfile: 'dist/tiptap-bundle.js',
  format: 'iife',
  globalName: 'TipTapBundle',
  target: ['es2018'],
  loader: {
    '.js': 'js'
  }
}).then(() => {
  console.log('TipTap bundle built successfully: dist/tiptap-bundle.js');
}).catch((error) => {
  console.error('Build failed:', error);
  process.exit(1);
});
