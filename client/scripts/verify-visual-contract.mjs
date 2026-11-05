import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../',import.meta.url));
const base='e6f6fe5d32a3820803e7797b9f91364c62c32526';
const protectedPaths=['api','client/src/api.ts','client/src/calls.ts','client/src/RemoteAudio.tsx','client/src/main.tsx','client/package.json','client/package-lock.json','client/tests','compose.yaml','Dockerfile','render.yaml','client/vite.config.ts','client/vercel.json'];
execFileSync('git',['diff','--exit-code',base,'--',...protectedPaths],{cwd:root,stdio:'pipe'});
function calls(text,pattern){const found=[];for(const match of text.matchAll(pattern)){const start=match.index,open=text.indexOf('(',start);let depth=0,quote='',escaped=false;for(let i=open;i<text.length;i++){const c=text[i];if(quote){if(escaped){escaped=false;continue;}if(c==='\\'){escaped=true;continue;}if(c===quote)quote='';continue;}if(c==='"'||c==="'"||c==='`'){quote=c;continue;}if(c==='(')depth++;if(c===')'&&--depth===0){found.push(text.slice(start,i+1).replace(/\s+/g,''));break;}}}return found;}
for(const path of ['client/src/App.tsx','client/src/CallPanel.tsx']){const before=execFileSync('git',['show',`${base}:${path}`],{cwd:root,encoding:'utf8'}),after=await readFile(new URL(path,new URL('../../',import.meta.url)),'utf8');assert.deepEqual(calls(after,/\bapi\.(?:get|post|interceptors\.response\.use)\s*(?:<[^;\n]*?>)?\s*\(/g).sort(),calls(before,/\bapi\.(?:get|post|interceptors\.response\.use)\s*(?:<[^;\n]*?>)?\s*\(/g).sort(),`${path}: API calls/payloads changed`);const effects=calls(after,/\buseEffect\s*\(/g);for(const original of calls(before,/\buseEffect\s*\(/g))assert.ok(effects.includes(original),`${path}: original effect changed`);}
console.log('PASS: backend, API adapter, WebRTC controller, remote audio, deployment/dependencies/tests unchanged; original API call source/payloads and effects preserved (whitespace-normalized source comparison).');
