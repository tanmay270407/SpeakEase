import { z } from 'zod';
import { buildCorsairToolDefs } from '@corsair-dev/mcp';
import { createCorsair } from 'corsair';

const clinicalPlugin = {
  id: 'clinical',
  api: {
    get_patients: async () => { return { ok: true } }
  },
  endpointMeta: {
    get_patients: { description: "Get patients." }
  },
  endpointSchemas: {
    get_patients: { input: z.object({}), output: z.any() }
  }
};

const client = createCorsair({ plugins: [clinicalPlugin], kek: 'test' });
const tools = buildCorsairToolDefs({ corsair: client });
console.log(tools);
