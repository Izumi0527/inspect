const fs = require('fs')
const [,, file, startArg, endArg] = process.argv
if (!file) {
  console.error('Usage: node print-lines.js <file> [start] [end]')
  process.exit(1)
}
const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
const start = startArg ? parseInt(startArg, 10) : 1
const end = endArg ? parseInt(endArg, 10) : lines.length
for (let i = Math.max(start, 1); i <= Math.min(end, lines.length); i += 1) {
  console.log(`${i}:${lines[i - 1]}`)
}
