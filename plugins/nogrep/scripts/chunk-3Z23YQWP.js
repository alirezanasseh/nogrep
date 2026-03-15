import { createRequire } from 'module'; const require = createRequire(import.meta.url);

// scripts/types.ts
var NogrepError = class extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
};

export {
  NogrepError
};
//# sourceMappingURL=chunk-3Z23YQWP.js.map