const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const JavaScriptObfuscator = require('javascript-obfuscator');

console.log('[*] Compiling TypeScript sources in src/...');
try {
  execSync('npx tsc', { stdio: 'inherit' });
  console.log('[+] TypeScript compilation completed.');
} catch (err) {
  console.error('[!] TypeScript compilation error:', err.message);
  process.exit(1);
}

function obfuscateFile(srcPath, distPath, label) {
  console.log(`[*] Obfuscating ${label}...`);
  let sourceCode = fs.readFileSync(srcPath, 'utf8');

  // Strip standalone export statements and export modifiers from TypeScript emit for browser runtime
  sourceCode = sourceCode.replace(/export\s*\{\s*\};?/g, '');
  sourceCode = sourceCode.replace(/export\s+default\s+/g, '');
  sourceCode = sourceCode.replace(/export\s+(async\s+)?function/g, '$1function');
  sourceCode = sourceCode.replace(/export\s+(const|let|var|class)/g, '$1');
  sourceCode = sourceCode.replace(/export\s*\{[^}]*\};?/g, '');

  const obfuscationResult = JavaScriptObfuscator.obfuscate(sourceCode, {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.75,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.35,
    identifierNamesGenerator: 'hexadecimal',
    renameGlobals: false,
    rotateStringArray: true,
    selfDefending: true,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 0.85,
    splitStrings: true,
    splitStringsChunkLength: 8
  });

  fs.writeFileSync(distPath, obfuscationResult.getObfuscatedCode(), 'utf8');
  console.log(`[+] Successfully wrote protected build to ${distPath} (${Buffer.byteLength(obfuscationResult.getObfuscatedCode())} bytes)`);
}

// 1. Obfuscate TypeScript Login Bundle
obfuscateFile(
  path.join(__dirname, 'dist', 'login.js'),
  path.join(__dirname, 'public', 'login.js'),
  'dist/login.js -> public/login.js'
);

// 2. Obfuscate TypeScript Room & Oracle Bundle
obfuscateFile(
  path.join(__dirname, 'dist', 'room.js'),
  path.join(__dirname, 'public', 'room.js'),
  'dist/room.js -> public/room.js'
);

// 3. Obfuscate Owner Management Gateway
const ownerSrc = path.join(__dirname, 'owner-panel.src.js');
const ownerDistRoot = path.join(__dirname, 'public', 'owner-panel.js');
if (fs.existsSync(ownerSrc)) {
  obfuscateFile(ownerSrc, ownerDistRoot, 'owner-panel.src.js -> public/owner-panel.js');
}

// 4. Obfuscate Legacy Bundle
if (fs.existsSync(path.join(__dirname, 'app.src.js'))) {
  obfuscateFile(
    path.join(__dirname, 'app.src.js'),
    path.join(__dirname, 'public', 'app.js'),
    'app.src.js -> public/app.js'
  );
}
