import IntroClient from './IntroClient';

export const metadata = {
    title: 'Clases de Prueba | Absolute Archery',
    description: 'Gestión de clases de introducción y prospectos',
};

export default function IntroClassesPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-textpri">Clases de Prueba</h1>
                <p className="mt-1 text-sm text-textsec">
                    Gestión de clientes de 1 día y asignación de arcos
                </p>
            </div>

            <IntroClient />
        </div>
    );
}
