import sharp from 'sharp'
import { promises as fs } from 'fs'
import path from 'path'

const sizes = [72, 96, 128, 144, 152, 192, 384, 512]
const inputSvg = path.resolve('./public/icon.svg')
const outputDir = path.resolve('./public/icons')

await fs.mkdir(outputDir, { recursive: true })

for (const size of sizes) {
  await sharp(inputSvg)
    .resize(size, size)
    .png()
    .toFile(path.join(outputDir, `icon-${size}x${size}.png`))
  console.log(`Generated ${size}x${size}`)
}

console.log('All icons generated!')