import { writeFile } from 'node:fs/promises'

const value = process.argv[2]
if (!value) throw new Error('Usage: npm run configure:hosting -- https://YOUR-API.onrender.com')
const api = new URL(value)
if (api.protocol !== 'https:' || api.username || api.password || api.search || api.hash || api.pathname !== '/') {
  throw new Error('Use the HTTPS origin of your API, without paths, credentials or query parameters.')
}
const config = {
  $schema: 'https://openapi.vercel.sh/vercel.json',
  framework: 'vite',
  buildCommand: 'npm run build',
  outputDirectory: 'dist',
  rewrites: [
    { source: '/api/:path*', destination: api.origin + '/api/:path*' },
    { source: '/:path*', destination: '/index.html' },
  ],
  headers: [
    { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
  ],
}
await writeFile(new URL('../vercel.json', import.meta.url), JSON.stringify(config, null, 2) + '\n')
console.log('Created client/vercel.json. API:', api.origin)
