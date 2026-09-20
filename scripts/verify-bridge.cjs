const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const candidates = [
  path.join(os.homedir(), 'AppData', 'Roaming', 'Watch X', 'watchx-bridge-status.json'),
  path.join(os.homedir(), 'AppData', 'Roaming', 'watch-x', 'watchx-bridge-status.json'),
]
const deadline = Date.now() + 45000

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

;(async () => {
  while (Date.now() < deadline) {
    for (const statusPath of candidates) {
      if (!fs.existsSync(statusPath)) continue
      const data = JSON.parse(fs.readFileSync(statusPath, 'utf8'))
      console.log(statusPath)
      console.log(JSON.stringify(data, null, 2))
      if (data.ok === true && (data.result?.hasWatchx || data.stage === 'metrics')) {
        process.exit(0)
      }
      if (data.stage === 'preload-error' || data.stage === 'preload-missing') {
        process.exit(2)
      }
    }
    await sleep(1000)
  }
  console.error('Timed out waiting for bridge status')
  process.exit(1)
})()
