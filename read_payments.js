const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = 'https://xgjmgsuggybvsxosgfqi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhnam1nc3VnZ3lidnN4b3NnZnFpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzM5NDA0MCwiZXhwIjoyMDcyOTcwMDQwfQ.nznwRmDxGFWiSnqF6Z2fjWvpxWAwS7qm4vJicPYyS2M';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPayments() {
    const { data, error } = await supabase
        .from('student_membership_payments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error('Error fetching payments:', error);
    } else {
        fs.writeFileSync('payments.json', JSON.stringify(data, null, 2));
        console.log('Saved 5 latest payments to payments.json');
    }
}

checkPayments();
