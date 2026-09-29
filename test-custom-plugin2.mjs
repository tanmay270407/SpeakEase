import { buildCorsairToolDefs } from '@corsair-dev/mcp';
import { createCorsair } from 'corsair';
import { github } from '@corsair-dev/github';

const client = createCorsair({ plugins: [github()], kek: 'test' });
const tools = buildCorsairToolDefs({ corsair: client });
console.log(tools.map(t => t.name));
