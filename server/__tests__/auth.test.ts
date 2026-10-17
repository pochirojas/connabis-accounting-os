import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword } from '../auth';

test('hashPassword produces salted scrypt hashes', () => {
  const a = hashPassword('una-clave-larga');
  const b = hashPassword('una-clave-larga');
  assert.match(a, /^scrypt\$[\w-]+\$[\w-]+$/);
  assert.notEqual(a, b);
});
