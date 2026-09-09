#!/usr/bin/env node
/**
 * bump-version.js
 * Automatically stamps the build number and date into src/config/version.js
 * before each production build.
 *
 * Usage: node scripts/bump-version.js
 * Called automatically by the "prebuild" npm script.
 */
const fs = require("fs");
const path = require("path");

const versionFile = path.join(__dirname, "..", "src", "config", "version.js");

// Build number = epoch seconds (compact, always unique, always increasing)
const buildNum = Math.floor(Date.now() / 1000).toString();
const buildDate = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";

// Read the current version file
let content = fs.readFileSync(versionFile, "utf8");

// Replace placeholders or previous values
content = content.replace(
  /const BUILD_NUMBER = ".*?";/,
  `const BUILD_NUMBER = "${buildNum}";`
);
content = content.replace(
  /const BUILD_DATE = ".*?";/,
  `const BUILD_DATE = "${buildDate}";`
);

fs.writeFileSync(versionFile, content, "utf8");
console.log(`[bump-version] Build #${buildNum} stamped at ${buildDate}`);
