import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
    const { data: ledger, error } = await supabase
        .from('student_credit_ledger')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5)

    console.log('Últimos 5 movimientos en el Ledger:', ledger)

    const { data: bookings, error: bErr } = await supabase
        .from('bookings')
        .select('id, student_id, session_id, status, active_membership_id')
        .order('updated_at', { ascending: false })
        .limit(5)

    console.log('Últimas 5 reservas:', bookings)
}

test()
