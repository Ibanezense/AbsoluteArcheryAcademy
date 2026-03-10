import { supabase } from '@/lib/supabaseClient';

export type FinanceRecord = {
    payment_id: string;
    paid_at: string;
    student_name: string;
    plan_name: string;
    base_price: number;
    amount_paid: number;
    discount_calculated: number;
    payment_method: string;
    payment_status: string;
};

export class FinancesService {
    static async getMonthlyReport(startDate: string, endDate: string): Promise<FinanceRecord[]> {
        const { data, error } = await supabase.rpc('get_finances_report', {
            p_start_date: startDate,
            p_end_date: endDate
        });

        if (error) {
            console.error("Error fetching finances report:", error);
            throw error;
        }

        return data || [];
    }
}
