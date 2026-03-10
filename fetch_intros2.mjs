import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

let envStr = '';
try { envStr = fs.readFileSync('.env.local', 'utf8'); } catch (e) { envStr = fs.readFileSync('.env', 'utf8'); }
const envList = envStr.split('\n');
const env = {};
for (const line of envList) {
    const [key, ...vals] = line.split('=');
    if (key && vals.length > 0) {
        env[key.trim()] = vals.join('=').trim().replace(/^['"]/, '').replace(/['"]$/, '');
    }
}

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    console.log("Testing exact query from service...");
    const { data, error } = await supabase
        .from('bookings')
        .select(`
            id,
            session_id,
            sessions!inner ( start_at, end_at ),
            intro_clients!inner ( id, full_name, age, phone )
        `)
        .not('intro_client_id', 'is', 'null')
        .gte('sessions.start_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
        .order('sessions.start_at', { ascending: true });

    fs.writeFileSync('fetch_intros_out2.txt', "Data: " + JSON.stringify(data) + "\nError: " + JSON.stringify(error) + "\n");
}
check();
