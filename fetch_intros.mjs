import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

let envStr = '';
try {
    envStr = fs.readFileSync('.env.local', 'utf8');
} catch (e) {
    envStr = fs.readFileSync('.env', 'utf8');
}
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
    console.log("Checking bookings with intro_client_id NOT NULL...");
    const { data: b, error } = await supabase
        .from('bookings')
        .select(`
            id,
            session_id,
            intro_client_id,
            status,
            distance_m,
            user_id
        `)
        .not('intro_client_id', 'is', 'null');

    fs.writeFileSync('fetch_intros_out.txt', "Bookings: " + JSON.stringify(b) + "\nError: " + JSON.stringify(error) + "\n");

    if (b && b.length > 0) {
        console.log("Testing join...");
        const { data: b2, error: err2 } = await supabase
            .from('bookings')
            .select(`
                id,
                session_id,
                sessions (start_at, end_at),
                intro_clients (id, full_name, age, phone)
            `)
            .not('intro_client_id', 'is', 'null');

        fs.appendFileSync('fetch_intros_out.txt', "Join Result: " + JSON.stringify(b2) + "\nError2: " + JSON.stringify(err2) + "\n");
    }
}
check();
