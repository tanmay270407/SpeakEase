import { createCorsair } from 'corsair';
const client = createCorsair({ plugins: [], kek: 'test' });
console.log(client.workflows);
