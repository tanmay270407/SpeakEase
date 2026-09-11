import { createCorsair } from 'corsair';
const client = createCorsair({ plugins: [], kek: 'test' });
client.workflows.run('wf_session_review', { payload: {} }).catch(console.log);
