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

export type FinanceDebtor = {
    student_id: string;
    student_name: string;
    overdue_count: number;
    overdue_amount: number;
    oldest_due_date: string | null;
};

export type FinanceOverdueRow = {
    payment_id: string;
    student_id: string;
    student_name: string;
    membership_name: string;
    amount: number;
    currency: string;
    payment_status: string;
    due_date: string | null;
    days_late: number;
};

export type FinanceActionableDashboard = {
    month_start: string;
    month_end: string;
    reference_date: string;
    paid_month: number;
    pending_month: number;
    projection_month: number;
    overdue_amount: number;
    overdue_count: number;
    pending_alerts: number;
    top_debtors: FinanceDebtor[];
    overdue_rows: FinanceOverdueRow[];
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

    static async getActionableDashboard(startDate: string, endDate: string): Promise<FinanceActionableDashboard> {
        const { data, error } = await supabase.rpc('get_finances_actionable_dashboard', {
            p_month_start: startDate,
            p_month_end: endDate,
            p_reference_date: new Date().toISOString().slice(0, 10),
        });

        if (error) {
            console.error('Error fetching actionable finance dashboard:', error);
            throw error;
        }

        return (data || {
            month_start: startDate,
            month_end: endDate,
            reference_date: new Date().toISOString().slice(0, 10),
            paid_month: 0,
            pending_month: 0,
            projection_month: 0,
            overdue_amount: 0,
            overdue_count: 0,
            pending_alerts: 0,
            top_debtors: [],
            overdue_rows: [],
        }) as FinanceActionableDashboard;
    }
}
