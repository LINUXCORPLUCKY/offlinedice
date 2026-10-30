const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

function obfuscateFile(srcPath, distPath, label) {
  console.log(`[*] Obfuscating ${label}...`);
  const sourceCode = fs.readFileSync(srcPath, 'utf8');

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

// 1. Obfuscate Client Application
obfuscateFile(
  path.join(__dirname, 'app.src.js'),
  path.join(__dirname, 'public', 'app.js'),
  'app.src.js'
);

// 2. Obfuscate Owner Management Gateway
const ownerSrc = path.join(__dirname, 'public', 'owner-panel', 'owner-panel.src.js');
const ownerDist = path.join(__dirname, 'public', 'owner-panel', 'owner-panel.js');
if (fs.existsSync(ownerSrc)) {
  obfuscateFile(ownerSrc, ownerDist, 'owner-panel.src.js');
}
