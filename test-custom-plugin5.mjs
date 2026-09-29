import { buildCorsairToolDefs } from '@corsair-dev/mcp';
import { createCorsair } from 'corsair';

const client = createCorsair({ plugins: [], kek: 'test' });
client.clinical = {
  get_patients: async () => { return { ok: "called it!" } }
};

const tools = buildCorsairToolDefs({ corsair: client });
const runScript = tools.find(t => t.name === 'run_script');
runScript.handler({ code: 'return await corsair.clinical.get_patients();' }).then(res => console.log(JSON.stringify(res, null, 2)));
