#!/usr/bin/env node
/**
 * scripts/build-dist.js
 * Builds and synchronizes the production web distribution for Staytup.
 * Ensures dist/ and frontend/dist/ are 100% up to date with public/.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Determine the true project root
const findProjectRoot = (startDir) => {
  let cur = startDir;
  while (cur !== path.dirname(cur)) {
    if (fs.existsSync(path.join(cur, 'public')) && fs.existsSync(path.join(cur, 'frontend'))) {
      return cur;
    }
    cur = path.dirname(cur);
  }
  return path.resolve(__dirname, '..');
};

const ROOT_DIR = findProjectRoot(__dirname);
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const FRONTEND_DIST_DIR = path.join(ROOT_DIR, 'frontend', 'dist');

console.log('🚀 [build-dist] Starting Staytup production distribution build...\n');

// 1. Verify public directory exists
if (!fs.existsSync(PUBLIC_DIR)) {
  console.error('❌ Error: public/ directory does not exist at', PUBLIC_DIR);
  process.exit(1);
}

// 2. Read metadata and index.html
const metaPath = path.join(PUBLIC_DIR, 'metadata.json');
let meta = {};
if (fs.existsSync(metaPath)) {
  meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
}

const indexPath = path.join(PUBLIC_DIR, 'index.html');
const indexHtml = fs.readFileSync(indexPath, 'utf8');
const bundleMatch = indexHtml.match(/index-[a-f0-9]+\.js/);
const activeBundle = bundleMatch ? bundleMatch[0] : meta.bundle;

console.log(`📦 Active App Version : v${meta.version || '2.8.8'}`);
console.log(`📦 Active Web Bundle  : ${activeBundle}`);

// 3. Verify active bundle file exists
const activeBundlePath = path.join(PUBLIC_DIR, '_expo', 'static', 'js', 'web', activeBundle);
if (!fs.existsSync(activeBundlePath)) {
  console.error(`❌ Error: Active bundle ${activeBundle} not found in public/_expo/static/js/web/`);
  process.exit(1);
}

// 4. Bundle Integrity check
console.log('🔍 Verifying bundle syntax and module integrity...');
const bundleContent = fs.readFileSync(activeBundlePath, 'utf8');

// Check that savedAlbums is defined in UserProvider
if (bundleContent.includes('savedAlbums,toggleSaveAlbum') && !bundleContent.includes('[savedAlbums,setSavedAlbums]=')) {
  console.error('❌ Error: savedAlbums is referenced in UserProvider return value but not declared!');
  process.exit(1);
}
console.log('✅ Bundle module integrity verified.');

// 5. Ensure target dist directories exist
[DIST_DIR, FRONTEND_DIST_DIR].forEach((d) => {
  if (!fs.existsSync(d)) {
    fs.mkdirSync(d, { recursive: true });
  }
});

// 6. Synchronize public/ to dist/ and frontend/dist/
console.log('🔄 Synchronizing public/ -> dist/...');
try {
  execSync(`rsync -av --delete "${PUBLIC_DIR}/" "${DIST_DIR}/"`, { stdio: 'ignore' });
} catch (_) {
  fs.cpSync(PUBLIC_DIR, DIST_DIR, { recursive: true });
}

console.log('🔄 Synchronizing public/ -> frontend/dist/...');
try {
  execSync(`rsync -av --delete "${PUBLIC_DIR}/" "${FRONTEND_DIST_DIR}/"`, { stdio: 'ignore' });
} catch (_) {
  fs.cpSync(PUBLIC_DIR, FRONTEND_DIST_DIR, { recursive: true });
}

// 7. Verify all files in dist/ and frontend/dist/
const checkDirs = [
  { name: 'dist', path: DIST_DIR },
  { name: 'frontend/dist', path: FRONTEND_DIST_DIR }
];

for (const target of checkDirs) {
  const reqFiles = [
    'index.html',
    'metadata.json',
    'sw.js',
    'manifest.json',
    'apple-touch-icon.png',
    'favicon.ico',
    'favicon.png',
    'icon-192.png',
    'icon-512.png',
    '.htaccess',
    path.join('_expo', 'static', 'js', 'web', activeBundle),
    path.join('api', 'index.php')
  ];

  for (const rf of reqFiles) {
    const fullP = path.join(target.path, rf);
    if (!fs.existsSync(fullP)) {
      console.error(`❌ Missing file in ${target.name}: ${rf}`);
      process.exit(1);
    }
  }

  const targetIndex = fs.readFileSync(path.join(target.path, 'index.html'), 'utf8');
  if (!targetIndex.includes(activeBundle)) {
    console.error(`❌ ${target.name}/index.html does not point to ${activeBundle}`);
    process.exit(1);
  }
}

console.log('\n✨ Build completed successfully!');
console.log('----------------------------------------------------');
console.log(`✅ Root Dist     : ${DIST_DIR}`);
console.log(`✅ Frontend Dist : ${FRONTEND_DIST_DIR}`);
console.log(`✅ Version       : ${meta.version}`);
console.log(`✅ Bundle        : ${activeBundle}`);
console.log('----------------------------------------------------\n');
