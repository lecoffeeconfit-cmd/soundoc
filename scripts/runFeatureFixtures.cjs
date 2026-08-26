const { mkdtempSync, rmSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = mkdtempSync(path.join(os.tmpdir(), 'soundoc-fixtures-'));
const fixtures = [
  'src/lib/chapterDetection.test.ts',
  'src/lib/sectionIntelligence.test.ts',
  'src/lib/largeDocuments.chapter.test.ts',
  'src/lib/chapterPresentation.test.ts',
  'src/lib/chapterNavigation.test.ts',
];
const compiler = path.join(root, 'node_modules', '.bin', 'tsc');

try {
  const compile = spawnSync(compiler, [
    '--ignoreConfig',
    '--module', 'commonjs', '--target', 'es2020', '--moduleResolution', 'node', '--ignoreDeprecations', '6.0',
    '--esModuleInterop', '--skipLibCheck', '--types', 'node', '--outDir', output, ...fixtures,
  ], { cwd: root, stdio: 'inherit' });
  if (compile.status !== 0) process.exit(compile.status ?? 1);
  for (const fixture of fixtures) {
    const compiled = path.join(output, 'lib', path.basename(fixture).replace(/\.ts$/, '.js'));
    const result = spawnSync(process.execPath, [compiled], { cwd: root, stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
} finally {
  rmSync(output, { recursive: true, force: true });
}
