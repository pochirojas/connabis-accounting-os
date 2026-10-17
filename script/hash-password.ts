// Usage: npm run hash-password -- 'mi-contraseña'
// Prints the value to paste into AUTH_USERS (email:Nombre:<hash>).
import { hashPassword } from '../server/auth';

const password = process.argv[2];
if (!password || password.length < 10) {
  console.error('Uso: npm run hash-password -- "contraseña de al menos 10 caracteres"');
  process.exit(1);
}
console.log(hashPassword(password));
