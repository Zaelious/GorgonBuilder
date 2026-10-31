import { registerHooks } from 'node:module';
import { extname } from 'node:path';

// The existing normalizers use bundler-style relative imports. Resolve those
// during this Node-only command without changing their contracts or app config.
registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(specifier.startsWith('.') && !extname(specifier) ? `${specifier}.ts` : specifier, context);
  },
});
