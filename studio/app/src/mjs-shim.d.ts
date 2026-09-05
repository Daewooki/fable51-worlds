// The schemas package (../../schemas/*.mjs) is plain ESM with no type declarations.
// Vite serves it fine at runtime; this ambient module keeps `tsc --noEmit` quiet.
declare module '*.mjs';
