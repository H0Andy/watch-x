const fs = require('fs')
const path = require('path')
const png2icons = require('png2icons')
const { execFileSync } = require('child_process')

const root = path.join(__dirname, '..')
const buildDir = path.join(root, 'build')
const sourceCandidates = [
  path.join(buildDir, 'logo-source.png'),
  path.join(buildDir, 'icon.png'),
]

const source = sourceCandidates.find((file) => fs.existsSync(file))
if (!source) {
  console.error('Missing logo source. Place build/logo-source.png first.')
  process.exit(1)
}

# Ensure multi-size PNGs via Python/Pillow when available (optional)
try {
  execFileSync(
    'python',
    [
      '-c',
      `
from pathlib import Path
from PIL import Image
src = Path(r'''${source.replace(/\\/g, '/')}''')
root = Path(r'''${buildDir.replace(/\\/g, '/')}''')
icons = root / 'icons'
icons.mkdir(parents=True, exist_ok=True)
img = Image.open(src).convert('RGBA')
side = max(img.size)
canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
canvas.paste(img, ((side - img.size[0]) // 2, (side - img.size[1]) // 2), img)
master = canvas.resize((1024, 1024), Image.Resampling.LANCZOS)
master.save(root / 'icon.png', optimize=True)
for s in [16, 24, 32, 48, 64, 128, 256, 512, 1024]:
    master.resize((s, s), Image.Resampling.LANCZOS).save(icons / f'{s}x{s}.png', optimize=True)
print('png set ok')
`,
    ],
    { stdio: ['ignore', 'inherit', 'ignore'] },
  )
} catch {
  console.warn('Pillow resize skipped, using existing icon.png')
}

const input = fs.readFileSync(path.join(buildDir, 'icon.png'))
const ico = png2icons.createICO(input, png2icons.BICUBIC, 0, false, true)
const icns = png2icons.createICNS(input, png2icons.BICUBIC, 0)
fs.writeFileSync(path.join(buildDir, 'icon.ico'), ico)
fs.writeFileSync(path.join(buildDir, 'icon.icns'), icns)
fs.writeFileSync(path.join(buildDir, 'installerIcon.ico'), ico)
fs.writeFileSync(path.join(buildDir, 'uninstallerIcon.ico'), ico)
console.log(`Wrote icon.ico (${ico.length} bytes) and icon.icns (${icns.length} bytes)`)
