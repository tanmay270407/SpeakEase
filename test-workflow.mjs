import { createCorsair } from 'corsair';
console.log(Object.keys(createCorsair({ kek: 'test' }).workflows || {}));
