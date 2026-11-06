const { resetDatabase } = require('../scripts/resetDatabase');

// Gerçek dosya silmek yerine, verilen hatayı fırlatan sahte bir silme fonksiyonu
const failWith = (code) =>
  jest.fn(() => {
    const err = new Error(`${code}: simulated error`);
    err.code = code;
    throw err;
  });

describe('resetDatabase', () => {
  test('deletes the database file and returns true', () => {
    const removeFile = jest.fn();

    expect(resetDatabase('/tmp/test.db', removeFile)).toBe(true);
    expect(removeFile).toHaveBeenCalledWith('/tmp/test.db', { force: true });
  });

  test.each(['EBUSY', 'EPERM'])('returns false when the file is in use (%s)', (code) => {
    expect(resetDatabase('/tmp/test.db', failWith(code))).toBe(false);
  });

  test('throws any other error', () => {
    expect(() => resetDatabase('/tmp/test.db', failWith('EISDIR'))).toThrow('EISDIR');
  });

  test('does not touch anything for an in-memory database', () => {
    const removeFile = jest.fn();

    expect(resetDatabase(':memory:', removeFile)).toBe(true);
    expect(removeFile).not.toHaveBeenCalled();
  });
});
