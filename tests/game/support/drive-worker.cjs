// Starts a driver worker thread for the invariants test. A worker started on a .ts file with
// `--import tsx` is loaded by Node's own ESM loader on newer Node 22 releases (type stripping), which
// can't resolve this repo's extensionless imports; tsx's CommonJS hook works on every supported Node.
require('tsx/cjs')
require('./drive-worker.ts')
