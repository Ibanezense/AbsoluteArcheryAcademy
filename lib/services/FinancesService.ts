import { supabase } from '@/lib/supabaseClient';
import { getLimaDateKey } from '@/lib/utils/membershipCycles';

export type FinanceRecord = {
    payment_id: string;
    sale_at: string;
    paid_at: string | null;
    movement_kind: 'membership' | 'intro';
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
    top_debtors: FinanceDebtor[];
    overdue_rows: FinanceOverdueRow[];
};

export class FinancesService {
    static async getMonthlyReport(startDate: string, endDate: string): Promise<FinanceRecord[]> {
        const records: FinanceRecord[] = [];
        const pageSize = 500;
        for (let offset = 0; ; offset += pageSize) {
            const { data, error } = await supabase.rpc('get_finances_sales_report', {
                p_start_date: startDate,
                p_end_date: endDate,
            }).order('sale_at', { ascending: false }).order('payment_id', { ascending: true }).range(offset, offset + pageSize - 1);
            if (error) throw error;
            if (!Array.isArray(data)) throw new Error('El reporte financiero está incompleto. Vuelve a intentarlo.');
            const page = data as FinanceRecord[];
            if (page.some(record => !record.sale_at || !Number.isFinite(Date.parse(record.sale_at)))) {
                throw new Error('El reporte contiene movimientos sin fecha de venta válida.');
            }
            records.push(...page);
            if (page.length < pageSize) return records;
        }
    }

    static async getActionableDashboard(startDate: string, endDate: string): Promise<FinanceActionableDashboard> {
        const { data, error } = await supabase.rpc('get_finances_sales_dashboard', {
            p_month_start: startDate,
            p_month_end: endDate,
            p_reference_date: getLimaDateKey(),
        });

        if (error) {
            console.error('Error fetching actionable finance dashboard:', error);
            throw error;
        }

        if (!data) throw new Error('El resumen financiero no está disponible.');
        return data as FinanceActionableDashboard;
    }
}
