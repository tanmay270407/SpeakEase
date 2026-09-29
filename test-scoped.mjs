import { z } from 'zod';
import { buildCorsairToolDefs } from '@corsair-dev/mcp';
import { createCorsair } from 'corsair';

function createClinicalPlugin(slpId) {
  return {
    id: 'clinical',
    endpoints: {
      get_patients: async () => { return { slpId } }
    },
    endpointMeta: {
      get_patients: { description: "Get patients for SLP" }
    },
    endpointSchemas: {
      get_patients: { input: z.object({}), output: z.any() }
    }
  }
}

const client = createCorsair({ plugins: [createClinicalPlugin("slp-123")], kek: 'test' });
const tools = buildCorsairToolDefs({ corsair: client });
const runScript = tools.find(t => t.name === 'run_script');
runScript.handler({ code: 'return await corsair.clinical.api.get_patients();' }).then(res => console.log(JSON.stringify(res, null, 2)));
