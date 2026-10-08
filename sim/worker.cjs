// Starts a simulator worker thread (T13). A worker started on a .ts file with `--import tsx` loads it
// through Node's own ESM loader on newer Node 22 releases (type stripping), which can't resolve this
// repo's extensionless imports. Registering tsx's CommonJS hook here and requiring the TypeScript
// works on every Node the app supports, and keeps rules.ts on the path sim/overrides.ts patches.
require('tsx/cjs')
require('./worker.ts')
