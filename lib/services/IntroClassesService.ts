import { supabase } from '@/lib/supabaseClient';

export type IntroClientRecord = {
    booking_id: string;
    intro_client_id: string;
    full_name: string;
    age: number;
    phone?: string;
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
    booked_total: number; // bookings totales (regulares + intro) para calcular cupo real
    clients: { booking_id: string; full_name: string; age: number; phone?: string }[];
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

    /**
     * Obtiene las sesiones del próximo fin de semana (o el actual)
     * agrupadas por sábado y domingo, con clientes intro y cupo real.
     */
    static async getIntrosByWeekend(): Promise<IntroWeekendData> {
        const now = new Date();
        const dayOfWeek = now.getDay(); // 0=Dom, 6=Sáb

        // Calcular el próximo sábado (o hoy si ya es sáb/dom)
        let satDate: Date;
        if (dayOfWeek === 6) {
            satDate = new Date(now);
        } else if (dayOfWeek === 0) {
            satDate = new Date(now);
            satDate.setDate(satDate.getDate() - 1); // retroceder al sábado
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

        // Traer todas las sesiones del sáb y dom con su capacidad de 10m
        const { data: sessionsData, error: sessionsError } = await supabase
            .from('sessions')
            .select(`
                id, start_at, end_at,
                session_distance_allocations ( distance_m, slot_capacity, targets )
            `)
            .gte('start_at', satStart)
            .lte('start_at', sunEnd)
            .order('start_at', { ascending: true });

        if (sessionsError) throw sessionsError;

        const sessionIds = (sessionsData || []).map(s => s.id);

        // Traer TODOS los bookings de esas sesiones (para contar cupo real ocupado)
        let allBookings: any[] = [];
        if (sessionIds.length > 0) {
            const { data: bkData, error: bkErr } = await supabase
                .from('bookings')
                .select('id, session_id, intro_client_id, status, distance_m')
                .in('session_id', sessionIds)
                .in('status', ['reserved', 'attended', 'no_show']);

            if (bkErr) throw bkErr;
            allBookings = bkData || [];
        }

        // Traer info de los clientes intro que están en esos bookings
        const introBookingIds = allBookings
            .filter(b => b.intro_client_id)
            .map(b => b.intro_client_id);

        let introClientsMap: Record<string, any> = {};
        if (introBookingIds.length > 0) {
            const { data: icData, error: icErr } = await supabase
                .from('intro_clients')
                .select('id, full_name, age, phone')
                .in('id', introBookingIds);

            if (icErr) throw icErr;
            (icData || []).forEach(c => { introClientsMap[c.id] = c; });
        }

        // Construir los grupos por sesión
        const buildGroup = (session: any): IntroSessionGroup => {
            const alloc = Array.isArray(session.session_distance_allocations)
                ? session.session_distance_allocations.find((a: any) => a.distance_m === 10)
                : session.session_distance_allocations?.distance_m === 10
                    ? session.session_distance_allocations
                    : null;

            const slotCapacity = alloc?.slot_capacity || (alloc?.targets ? alloc.targets * 4 : 0);
            const capacity = slotCapacity === 0 ? 12 : slotCapacity;

            const sessionBookings = allBookings.filter(b => b.session_id === session.id);
            const bookedTotal = sessionBookings.filter(b => b.distance_m === 10).length;

            const introClients = sessionBookings
                .filter(b => b.intro_client_id)
                .map(b => {
                    const client = introClientsMap[b.intro_client_id];
                    return client ? {
                        booking_id: b.id,
                        full_name: client.full_name,
                        age: client.age,
                        phone: client.phone,
                    } : null;
                })
                .filter(Boolean) as IntroSessionGroup['clients'];

            return {
                session_id: session.id,
                start_at: session.start_at,
                end_at: session.end_at,
                capacity,
                booked_total: bookedTotal,
                clients: introClients,
            };
        };

        const satSessions = (sessionsData || [])
            .filter(s => s.start_at >= satStart && s.start_at <= satEnd)
            .map(buildGroup);

        const sunSessions = (sessionsData || [])
            .filter(s => s.start_at >= sunStart && s.start_at <= sunEnd)
            .map(buildGroup);

        return {
            saturday: { date: satStart.split('T')[0], sessions: satSessions },
            sunday: { date: sunStart.split('T')[0], sessions: sunSessions },
        };
    }

    // 1. Obtener los alumnos que vienen de prueba
    static async getUpcomingIntros(): Promise<IntroClientRecord[]> {
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
            .order('start_at', { foreignTable: 'sessions', ascending: true });

        if (error) {
            console.error('Error fetching intro classes:', error);
            throw error;
        }

        return (data || []).map((row: any) => ({
            booking_id: row.id,
            intro_client_id: row.intro_clients.id,
            full_name: row.intro_clients.full_name,
            age: row.intro_clients.age,
            phone: row.intro_clients.phone,
            session_id: row.session_id,
            session_start: row.sessions.start_at,
            session_end: row.sessions.end_at,
        }));
    }

    // 2. Obtener turnos con cupo disponible para los próximos 7 días
    static async getAvailableSessions(daysAhead: number = 7): Promise<AvailableIntroSession[]> {
        const now = new Date();
        const future = new Date();
        future.setDate(future.getDate() + daysAhead);

        // Obtener todas las sesiones en ese rango que tengan configurada la distancia de 10m
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

        // Obtener los count de bookings agrupados no es trivial sin un RPC en la API Rest de Supabase (sin usar joins complejos).
        // Como son 7 dias y el volumen es manejable, traeremos las reservas y las agruparemos.
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

                // Extraer la capacidad desde V3 engine array o objeto unico
                const alloc = Array.isArray(s.session_distance_allocations)
                    ? s.session_distance_allocations[0]
                    : s.session_distance_allocations;

                const slotCapacity = alloc?.slot_capacity || (alloc?.targets ? alloc.targets * 4 : 0);
                const realCapacity = slotCapacity === 0 ? 12 : slotCapacity; // Fallback preventivo

                return {
                    session_id: s.id,
                    start_at: s.start_at,
                    end_at: s.end_at,
                    capacity: realCapacity,
                    booked: booked,
                    available: realCapacity - booked,
                };
            })
            .filter(s => s.available > 0); // Solo devolver los que tienen cupo
    }

    // 3. Registrar "Todo En Uno" (Cliente -> Pago -> Booking)
    static async registerIntroClass(payload: {
        fullName: string;
        age: number;
        phone?: string;
        sessionId: string;
        amountPaid: number;
        paymentMethod: string;
    }): Promise<boolean> {

        // Esta operación requiere de 3 inserts distribuidos (idealmente debería ser un RPC en BD para transaccionalidad, 
        // pero como el schema RLS de admin confía en nosotros, intentaremos insert encadenado validando el último).

        try {
            // a. Insert Client
            const { data: clientData, error: clientErr } = await supabase
                .from('intro_clients')
                .insert({
                    full_name: payload.fullName,
                    age: payload.age,
                    phone: payload.phone
                })
                .select('id')
                .single();

            if (clientErr) throw clientErr;
            const newClientId = clientData.id;

            // b. Insert Booking (para que capture el cupo)
            const { error: bookingErr } = await supabase
                .from('bookings')
                .insert({
                    session_id: payload.sessionId,
                    intro_client_id: newClientId,
                    status: 'reserved',
                    distance_m: 10,
                    bow_usage_type: 'shared_inventory'
                    // no le mandamos user_id, queda NULO validando la constraint
                });

            if (bookingErr) throw bookingErr;

            // c. Insert Payment
            const { error: paymentErr } = await supabase
                .from('intro_payments')
                .insert({
                    intro_client_id: newClientId,
                    amount: payload.amountPaid,
                    payment_method: payload.paymentMethod
                });

            if (paymentErr) {
                console.error('El cupo se reservó pero falló el registro financiero', paymentErr);
            }

            return true;
        } catch (e) {
            console.error('Failed Intro Registration Sequence:', e);
            throw e;
        }
    }
}
