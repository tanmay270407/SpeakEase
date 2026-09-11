import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');

const target = `app.get("/api/corsair/slp/:slpId/dashboard", async (req, res) => {
  try {
    const { slpId } = req.params;
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Missing authorization" });

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: "Invalid token" });`;

const replacement = `app.get("/api/corsair/slp/:slpId/dashboard", async (req, res) => {
  try {
    const { slpId } = req.params;
    
    const supabase = getSupabaseClient(req);
    if (!supabase) return res.status(401).json({ error: "Missing authorization" });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return res.status(401).json({ error: "Invalid token" });`;

content = content.replace(target, replacement);
fs.writeFileSync('server.ts', content);
console.log('Fixed supabase reference in server.ts');
