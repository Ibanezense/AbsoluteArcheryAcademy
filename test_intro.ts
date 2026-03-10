import { supabase } from './lib/supabaseClient';

async function test() {
    const now = new Date();
    const future = new Date();
    future.setDate(future.getDate() + 7);

    const { data, error } = await supabase
        .from('sessions')
        .select(`
      id, start_at, end_at, status,
      session_distance_allocations!inner (
        distance_m, slot_capacity, targets
      )
    `)
        .eq('status', 'scheduled')
        .eq('session_distance_allocations.distance_m', 10)
        .gte('start_at', now.toISOString())
        .lte('start_at', future.toISOString());

    if (error) console.error(error);
    else console.log(JSON.stringify(data, null, 2));
}

test();
