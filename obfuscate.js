const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const srcPath = path.join(__dirname, 'app.src.js');
const distPath = path.join(__dirname, 'public', 'app.js');

const sourceCode = fs.readFileSync(srcPath, 'utf8');

console.log('[*] Obfuscating app.src.js...');

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
