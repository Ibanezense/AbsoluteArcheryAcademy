import { supabase } from '@/lib/supabaseClient';

export type IntroClassType = 'paid' | 'free' | 'courtesy';
export type IntroPaymentStatus = 'pending' | 'paid' | 'not_applicable';

export type IntroClientRecord = {
    booking_id: string;
    intro_client_id: string;
    full_name: string;
    age: number;
    phone?: string;
    booking_status: string;
    intro_class_type: IntroClassType;
    payment_status: IntroPaymentStatus;
    amount_paid: number | null;
    payment_method: string | null;
    paid_at: string | null;
    courtesy_reason: string | null;
    session_id: string;
    session_start: string;
    session_end: string;
};

export type AvailableIntroSession = {
    session_id: string;
    start_at: string;
    end_at: string;
    capacity: number;
    booked: number;
    available: number;
};

export type IntroSessionGroup = {
    session_id: string;
    start_at: string;
    end_at: string;
    capacity: number;
    booked_total: number;
    clients: {
        booking_id: string;
        intro_client_id: string;
        full_name: string;
        age: number;
        phone?: string;
        booking_status: string;
        intro_class_type: IntroClassType;
        payment_status: IntroPaymentStatus;
        amount_paid: number | null;
        payment_method: string | null;
        paid_at: string | null;
        courtesy_reason: string | null;
    }[];
};

export type IntroDayData = {
    date: string;
    sessions: IntroSessionGroup[];
};

export type IntroWeekendData = {
    saturday: IntroDayData;
    sunday: IntroDayData;
};

export class IntroClassesService {
    private static async fetchIntroSchedule({
        startAt,
        endAt,
    }: {
        startAt: string;
        endAt: string;
    }): Promise<IntroSessionGroup[]> {
        const { data: sessionsData, error: sessionsError } = await supabase
            .from('sessions')
            .select(`
                id, start_at, end_at,
                session_distance_allocations ( distance_m, slot_capacity, targets )
            `)
            .gte('start_at', startAt)
            .lte('start_at', endAt)
            .order('start_at', { ascending: true });

        if (sessionsError) throw sessionsError;

        const sessionIds = (sessionsData || []).map((session) => session.id);

        let allBookings: any[] = [];
        if (sessionIds.length > 0) {
            const { data: bookingsData, error: bookingsError } = await supabase
                .from('bookings')
                .select('id, session_id, intro_client_id, status, distance_m')
                .in('session_id', sessionIds)
                .in('status', ['reserved', 'attended', 'no_show']);

            if (bookingsError) throw bookingsError;
            allBookings = bookingsData || [];
        }

        const introClientIds = allBookings
            .filter((booking) => booking.intro_client_id)
            .map((booking) => booking.intro_client_id);

        let introClientsMap: Record<string, any> = {};
        if (introClientIds.length > 0) {
            const { data: introClientsData, error: introClientsError } = await supabase
                .from('intro_clients')
                .select('id, full_name, age, phone')
                .in('id', introClientIds);

            if (introClientsError) throw introClientsError;
            (introClientsData || []).forEach((client) => {
                introClientsMap[client.id] = client;
            });
        }

        let introPaymentsMap: Record<string, any> = {};
        if (introClientIds.length > 0) {
            const { data: paymentData, error: paymentError } = await supabase
                .from('intro_payments')
                .select('intro_client_id, amount, payment_method, paid_at, intro_class_type, payment_status, courtesy_reason')
                .in('intro_client_id', introClientIds)
                .order('paid_at', { ascending: false });

            if (paymentError) throw paymentError;
            (paymentData || []).forEach((payment) => {
                if (!introPaymentsMap[payment.intro_client_id]) {
                    introPaymentsMap[payment.intro_client_id] = payment;
                }
            });
        }

        return (sessionsData || []).map((session: any) => {
            const allocation = Array.isArray(session.session_distance_allocations)
                ? session.session_distance_allocations.find((item: any) => item.distance_m === 10)
                : session.session_distance_allocations?.distance_m === 10
                    ? session.session_distance_allocations
                    : null;

            const slotCapacity = allocation?.slot_capacity || (allocation?.targets ? allocation.targets * 4 : 0);
            const capacity = slotCapacity === 0 ? 12 : slotCapacity;
            const sessionBookings = allBookings.filter((booking) => booking.session_id === session.id);
            const bookedTotal = sessionBookings.filter((booking) => booking.distance_m === 10).length;

            const clients = sessionBookings
                .filter((booking) => booking.intro_client_id)
                .map((booking) => {
                    const client = introClientsMap[booking.intro_client_id];
                    const payment = introPaymentsMap[booking.intro_client_id];

                    return client ? {
                        booking_id: booking.id,
                        intro_client_id: booking.intro_client_id,
                        full_name: client.full_name,
                        age: client.age,
                        phone: client.phone,
                        booking_status: booking.status,
                        intro_class_type: payment?.intro_class_type || (Number(payment?.amount || 0) > 0 ? 'paid' : 'free'),
                        payment_status: payment?.payment_status || (Number(payment?.amount || 0) > 0 ? 'paid' : 'not_applicable'),
                        amount_paid: payment ? Number(payment.amount || 0) : null,
                        payment_method: payment?.payment_method || null,
                        paid_at: payment?.paid_at || null,
                        courtesy_reason: payment?.courtesy_reason || null,
                    } : null;
                })
                .filter(Boolean) as IntroSessionGroup['clients'];

            return {
                session_id: session.id,
                start_at: session.start_at,
                end_at: session.end_at,
                capacity,
                booked_total: bookedTotal,
                clients,
            };
        });
    }

    static async getIntrosByWeekend(): Promise<IntroWeekendData> {
        const now = new Date();
        const dayOfWeek = now.getDay();

        let satDate: Date;
        if (dayOfWeek === 6) {
            satDate = new Date(now);
        } else if (dayOfWeek === 0) {
            satDate = new Date(now);
            satDate.setDate(satDate.getDate() - 1);
        } else {
            const daysUntilSat = 6 - dayOfWeek;
            satDate = new Date(now);
            satDate.setDate(satDate.getDate() + daysUntilSat);
        }

        const sunDate = new Date(satDate);
        sunDate.setDate(sunDate.getDate() + 1);

        const satStart = new Date(satDate.setHours(0, 0, 0, 0)).toISOString();
        const satEnd = new Date(new Date(satDate).setHours(23, 59, 59, 999)).toISOString();
        const sunStart = new Date(sunDate.setHours(0, 0, 0, 0)).toISOString();
        const sunEnd = new Date(new Date(sunDate).setHours(23, 59, 59, 999)).toISOString();
        const sessions = await this.fetchIntroSchedule({ startAt: satStart, endAt: sunEnd });

        const satSessions = sessions.filter((session) => session.start_at >= satStart && session.start_at <= satEnd);
        const sunSessions = sessions.filter((session) => session.start_at >= sunStart && session.start_at <= sunEnd);

        return {
            saturday: { date: satStart.split('T')[0], sessions: satSessions },
            sunday: { date: sunStart.split('T')[0], sessions: sunSessions },
        };
    }

    static async getUpcomingIntroSchedule(daysAhead: number = 31): Promise<IntroSessionGroup[]> {
        const start = new Date();
        start.setHours(0, 0, 0, 0);

        const end = new Date(start);
        end.setDate(end.getDate() + daysAhead);
        end.setHours(23, 59, 59, 999);

        return this.fetchIntroSchedule({
            startAt: start.toISOString(),
            endAt: end.toISOString(),
        });
    }

    static async getUpcomingIntros(): Promise<IntroClientRecord[]> {
        const { data, error } = await supabase
            .from('bookings')
            .select(`
        id,
        session_id,
        status,
        sessions!inner ( start_at, end_at ),
        intro_clients!inner ( id, full_name, age, phone )
      `)
            .not('intro_client_id', 'is', 'null')
            .gte('sessions.start_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
            .order('start_at', { foreignTable: 'sessions', ascending: true });

        if (error) {
            console.error('Error fetching intro classes:', error);
            throw error;
        }

        const introClientIds = (data || []).map((row: any) => row.intro_clients.id);
        let introPaymentsMap: Record<string, any> = {};

        if (introClientIds.length > 0) {
            const { data: paymentData, error: paymentError } = await supabase
                .from('intro_payments')
                .select('intro_client_id, amount, payment_method, paid_at, intro_class_type, payment_status, courtesy_reason')
                .in('intro_client_id', introClientIds)
                .order('paid_at', { ascending: false });

            if (paymentError) throw paymentError;
            (paymentData || []).forEach(payment => {
                if (!introPaymentsMap[payment.intro_client_id]) {
                    introPaymentsMap[payment.intro_client_id] = payment;
                }
            });
        }

        return (data || []).map((row: any) => {
            const payment = introPaymentsMap[row.intro_clients.id];
            return {
            booking_id: row.id,
            intro_client_id: row.intro_clients.id,
            full_name: row.intro_clients.full_name,
            age: row.intro_clients.age,
            phone: row.intro_clients.phone,
            booking_status: row.status,
            intro_class_type: payment?.intro_class_type || (Number(payment?.amount || 0) > 0 ? 'paid' : 'free'),
            payment_status: payment?.payment_status || (Number(payment?.amount || 0) > 0 ? 'paid' : 'not_applicable'),
            amount_paid: payment ? Number(payment.amount || 0) : null,
            payment_method: payment?.payment_method || null,
            paid_at: payment?.paid_at || null,
            courtesy_reason: payment?.courtesy_reason || null,
            session_id: row.session_id,
            session_start: row.sessions.start_at,
            session_end: row.sessions.end_at,
            };
        });
    }

    static async getAvailableSessions(daysAhead: number = 31): Promise<AvailableIntroSession[]> {
        const now = new Date();
        const future = new Date();
        future.setDate(future.getDate() + daysAhead);

        const { data: sessionsData, error: sessionsError } = await supabase
            .from('sessions')
            .select(`
                id, 
                start_at, 
                end_at,
                session_distance_allocations!inner (
                    distance_m,
                    slot_capacity,
                    targets
                )
            `)
            .eq('status', 'scheduled')
            .eq('session_distance_allocations.distance_m', 10)
            .gte('start_at', now.toISOString())
            .lte('start_at', future.toISOString())
            .order('start_at', { ascending: true });

        if (sessionsError) throw sessionsError;

        const sessionIds = sessionsData.map(s => s.id);

        if (sessionIds.length === 0) return [];

        const { data: bookingsData, error: bookingsError } = await supabase
            .from('bookings')
            .select('session_id')
            .in('session_id', sessionIds)
            .eq('distance_m', 10)
            .in('status', ['reserved', 'attended', 'no_show']);

        if (bookingsError) throw bookingsError;

        const bookingCounts = bookingsData.reduce((acc, b) => {
            acc[b.session_id] = (acc[b.session_id] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        return sessionsData
            .map((s: any) => {
                const booked = bookingCounts[s.id] || 0;
                const alloc = Array.isArray(s.session_distance_allocations)
                    ? s.session_distance_allocations[0]
                    : s.session_distance_allocations;
                const slotCapacity = alloc?.slot_capacity || (alloc?.targets ? alloc.targets * 4 : 0);
                const realCapacity = slotCapacity === 0 ? 12 : slotCapacity;

                return {
                    session_id: s.id,
                    start_at: s.start_at,
                    end_at: s.end_at,
                    capacity: realCapacity,
                    booked,
                    available: realCapacity - booked,
                };
            })
            .filter(s => s.available > 0);
    }

    static async registerIntroClass(payload: {
        fullName: string;
        age: number;
        phone?: string;
        sessionId: string;
        amountPaid: number;
        paymentMethod: string;
        introClassType?: IntroClassType;
        paymentStatus?: IntroPaymentStatus;
        courtesyReason?: string;
    }): Promise<boolean> {
        try {
            const { error } = await supabase.rpc('admin_register_intro_class', {
                p_full_name: payload.fullName,
                p_age: payload.age,
                p_phone: payload.phone,
                p_session_id: payload.sessionId,
                p_amount_paid: payload.amountPaid,
                p_payment_method: payload.paymentMethod,
                p_intro_class_type: payload.introClassType || 'paid',
                p_payment_status: payload.paymentStatus || 'paid',
                p_courtesy_reason: payload.courtesyReason || null
            });

            if (error) throw new Error(error.message);
            return true;
        } catch (e) {
            console.error('Failed Intro Registration Sequence:', e);
            throw e;
        }
    }
}
