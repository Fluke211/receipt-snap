#!/usr/bin/env node
/*
 * Is this tree safe to publish as an OTA update RIGHT NOW?
 *
 * `APP_BUILD` is a JavaScript constant, so `eas update` pushes it to every
 * binary that is out there. Bump it for a native build, publish an OTA before
 * that binary reaches phones, and every build-6 phone starts reporting "build
 * 7" in the Summary footer. That is not a cosmetic error: it is the exact
 * misdirection that cost four days during the launch crash, when three JS
 * revisions were shipped as fixes for a binary nobody had correctly
 * identified (D-070). The crash screen already refuses to print a build number
 * for this reason (D-074); the footer cannot, because Tyler's standing rule is
 * that it shows one.
 *
 * `LIVE_BUILDS` in check-ota-safety.js already records which binaries are
 * actually out there, and its own rule is "add a row when a build is
 * submitted". So the guard writes itself: a tree whose `APP_BUILD` is ahead of
 * every live binary is a tree that has been prepared for a build which has not
 * shipped yet, and publishing it would lie to every phone.
 *
 * This is a PUBLISH guard, not a merge guard. Preparing build 7 in the
 * repository is correct and CI should stay green for it; publishing that same
 * JS over the air before build 7 exists is what is wrong. So it runs from the
 * update step in eas.yml rather than from ci.yml.
 *
 *   node scripts/check-publishable.js
 *
 * It clears itself: add build 7 to LIVE_BUILDS once it is submitted, exactly as
 * that file already tells you to, and this passes again.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const version = fs.readFileSync(path.join(ROOT, 'src/lib/version.ts'), 'utf8');
const m = /export const APP_BUILD = (\d+);/.exec(version);
if (!m) {
  console.log('::error::APP_BUILD could not be read from src/lib/version.ts');
  process.exit(1);
}
const appBuild = Number(m[1]);

const ota = fs.readFileSync(path.join(ROOT, 'scripts/check-ota-safety.js'), 'utf8');
const builds = [...ota.matchAll(/^\s*build: (\d+),$/gm)].map((x) => Number(x[1]));
if (!builds.length) {
  console.log('::error::no LIVE_BUILDS rows found in scripts/check-ota-safety.js');
  process.exit(1);
}
const newest = Math.max(...builds);

if (appBuild <= newest) {
  console.log(`APP_BUILD is ${appBuild}; the newest live binary is build ${newest}. Safe to publish.`);
  process.exit(0);
}

console.log('');
console.log(`  APP_BUILD is ${appBuild}, but the newest binary in LIVE_BUILDS is build ${newest}.`);
console.log('');
console.log('  This bundle would tell every phone it is running a build that has not');
console.log('  shipped. A build-' + newest + ' phone would report "build ' + appBuild + '" in the Summary');
console.log('  footer, which is the misdirection that cost four days in D-070.');
console.log('');
console.log(`  ::error::Refusing to publish: APP_BUILD ${appBuild} is ahead of every live binary (build ${newest}). Cut and submit that build first, then add it to LIVE_BUILDS in scripts/check-ota-safety.js, which is what this checks.`);
process.exit(1);
