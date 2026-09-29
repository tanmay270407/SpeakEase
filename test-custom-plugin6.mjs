import { z } from 'zod';
import { buildCorsairToolDefs } from '@corsair-dev/mcp';
import { createCorsair } from 'corsair';

const clinicalPlugin = {
  id: 'clinical',
  endpoints: {
    get_patients: async () => { return { ok: "called it!" } }
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
const listOp = tools.find(t => t.name === 'list_operations');
listOp.handler({}).then(res => console.log(JSON.stringify(res, null, 2)));
