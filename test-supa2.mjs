import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
    const { data: ledger, error } = await supabase
        .from('student_credit_ledger')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(3)

    const { data: bookings } = await supabase
        .from('bookings')
        .select('id, student_id, session_id, status, active_membership_id')
        .order('updated_at', { ascending: false })
        .limit(3)

    const { data: memberships } = await supabase
        .from('student_memberships')
        .select('id, student_id, classes_used, classes_remaining, classes_total, status, end_date')
        .order('updated_at', { ascending: false })
        .limit(3)

    fs.writeFileSync('supa-log.json', JSON.stringify({ ledger, bookings, memberships }, null, 2))
}

test()
