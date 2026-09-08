export default { test: {
    // several tests spawn processes (npm root -g, the Higgsfield binary) or launch browsers; under
    // full-suite load they exceed vitest's 5 s default even though each takes ~1.5 s alone
    testTimeout: 30000, include: ['test/**/*.test.mjs', 'test/**/*.test.ts'] } }
