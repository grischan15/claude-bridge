import { mkdirSync } from 'node:fs'
import { createServer } from './server.js'
import { ensureToken, AGENTS_DIR, HOST, PORT } from './config.js'

const token = ensureToken()
mkdirSync(AGENTS_DIR, { recursive: true })

const app = createServer(token)
app.listen(PORT, HOST, () => {
  console.log(`claude-bridge listening on http://${HOST}:${PORT}`)
  console.log(`token: ${token}`)
})
