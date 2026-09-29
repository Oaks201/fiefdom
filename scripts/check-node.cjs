// Electron 44's installer needs Node.js 22.12 or newer. On an older Node it quits before downloading
// Electron, and the app later fails with "Error: Electron uninstall". Stop early with a clear message.
const [major, minor] = process.versions.node.split('.').map(Number)
if (major < 22 || (major === 22 && minor < 12)) {
  console.error(`\nFiefdom needs Node.js 22.12 or newer, but this is ${process.version}.`)
  console.error('Install the LTS from https://nodejs.org, then run npm install again.\n')
  process.exit(1)
}
