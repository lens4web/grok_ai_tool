const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const output = mkdtempSync(path.join(tmpdir(), 'grok-tests-'));
try {
  const compile = spawnSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'),
    'src/lib/models.ts', 'src/lib/model-info.ts', 'src/lib/options.ts', 'src/lib/requests.ts', 'src/lib/responses.ts', 'src/lib/client.ts', 'src/lib/realtime.ts', 'src/app/api/grok/route.ts', 'src/app/api/session/route.ts', 'src/lib/i18n.ts', 'src/proxy.ts',
    '--outDir', output, '--module', 'commonjs', '--target', 'es2022', '--lib', 'es2022,dom', '--resolveJsonModule', '--strict', '--skipLibCheck', '--esModuleInterop'], { cwd: root, stdio: 'inherit' });
  if (compile.status !== 0) process.exitCode = compile.status ?? 1;
  else {
    const result = spawnSync(process.execPath, ['--test', 'tests/api.test.cjs'], { cwd: root, stdio: 'inherit', env: { ...process.env, TEST_BUILD_PATH: output, NODE_PATH: path.join(root, 'node_modules') } });
    process.exitCode = result.status ?? 1;
  }
} finally { rmSync(output, { recursive: true, force: true }); }
