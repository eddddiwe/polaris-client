// Pack definitions live in shared so both processes can consume them without
// pulling Node-only core modules into the renderer bundle.
export { PACKS, packById } from '../shared/packs'
