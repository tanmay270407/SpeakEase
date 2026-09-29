import { z } from 'zod';
import { buildCorsairToolDefs } from '@corsair-dev/mcp';
import { createCorsair } from 'corsair';

const clinicalPlugin = {
  id: 'clinical',
  name: 'clinical',
  api: {
    get_patients: async () => { return { ok: true } },
    get_sessions: async () => { return { ok: true } }
  },
  endpointMeta: {
    get_patients: { description: "Get patients." },
    get_sessions: { description: "Get sessions." }
  },
  endpointSchemas: {
    get_patients: { input: z.object({}), output: z.any() },
    get_sessions: { input: z.object({}), output: z.any() }
  }
};

const client = createCorsair({ plugins: [clinicalPlugin], kek: 'test' });
const tools = buildCorsairToolDefs({ corsair: client });
const listOp = tools.find(t => t.name === 'list_operations');
listOp.handler({}).then(res => console.log(res.text));
