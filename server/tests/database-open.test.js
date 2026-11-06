const { spawnSync } = require('child_process');
const os = require('os');
const path = require('path');

// SQLite klasör oluşturmaz, bu yüzden var olmayan bir klasördeki dosya açılamaz
const missingPath = path.join(os.tmpdir(), `helix-missing-${process.pid}`, 'test.db');

const runNode = (script) =>
  spawnSync(process.execPath, [path.resolve(__dirname, script)], {
    env: { ...process.env, DB_PATH: missingPath, PORT: '0' },
    encoding: 'utf8',
    timeout: 10000,
  });

describe('when the database cannot be opened', () => {
  test('the server stops with an error instead of running without a database', () => {
    const result = runNode('../src/index.js');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Cannot open the database');
  });

  test('the seed script fails instead of reporting success', () => {
    const result = runNode('../scripts/seed.js');

    expect(result.status).toBe(1);
    expect(result.stdout).not.toContain('Seed process completed.');
  });
});
