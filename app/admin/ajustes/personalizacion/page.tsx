'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type AccentColor = 'blue' | 'slate' | 'gray' | 'red' | 'green' | 'orange';

const accentColors = [
  { name: 'blue', label: 'Azul', color: '#3b82f6' },
  { name: 'slate', label: 'Pizarra', color: '#64748b' },
  { name: 'gray', label: 'Gris', color: '#6b7280' },
  { name: 'red', label: 'Rojo', color: '#ef4444' },
  { name: 'green', label: 'Verde', color: '#22c55e' },
  { name: 'orange', label: 'Naranja', color: '#f97316' },
] as const;

export default function PersonalizacionPage() {
  const [accentColor, setAccentColor] = useState<AccentColor>('orange');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    // Cargar color guardado
    const savedColor = localStorage.getItem('accentColor') as AccentColor;
    if (savedColor) setAccentColor(savedColor);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const root = document.documentElement;
    
    // Aplicar color de acento
    accentColors.forEach(color => {
      root.classList.remove(`accent-${color.name}`);
    });
    root.classList.add(`accent-${accentColor}`);

    // Guardar en localStorage
    localStorage.setItem('accentColor', accentColor);
    
    // Aplicar CSS variables para el color de acento
    const selectedColor = accentColors.find(c => c.name === accentColor);
    if (selectedColor) {
      root.style.setProperty('--accent-color', selectedColor.color);
    }
  }, [accentColor, mounted]);

  if (!mounted) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-700 rounded w-1/4 mb-6"></div>
          <div className="grid gap-6">
            <div className="h-48 bg-gray-700 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">
          Personalización
        </h1>
        <p className="text-gray-400 mt-1">
          Adapta el color de acento de la aplicación a tus preferencias
        </p>
      </div>

      {/* Color de Acento */}
      <Card className="p-6 bg-gray-800 border-gray-700">
        <h2 className="text-lg font-semibold text-white mb-4">
          Color de acento
        </h2>
        <p className="text-gray-400 mb-6">
          Personaliza el color principal de botones, elementos destacados y efectos hover en los menús
        </p>
        
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
          {accentColors.map((color) => (
            <button
              key={color.name}
              onClick={() => setAccentColor(color.name)}
              className={`
                relative p-6 rounded-xl border-2 transition-all hover:scale-105
                ${accentColor === color.name 
                  ? 'border-white scale-105' 
                  : 'border-gray-600 hover:border-gray-500'
                }
              `}
            >
              <div 
                className="w-12 h-12 rounded-full mx-auto mb-3"
                style={{ backgroundColor: color.color }}
              />
              <div className="text-sm font-medium text-white">
                {color.label}
              </div>
              {accentColor === color.name && (
                <div 
                  className="absolute -top-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: color.color }}
                >
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Vista previa del color */}
        <div className="mt-8 p-6 bg-gray-900 rounded-xl">
          <div className="text-sm text-gray-400 mb-4">
            Vista previa:
          </div>
          <div className="flex gap-4 flex-wrap">
            <Button 
              className="text-white font-medium"
              style={{ backgroundColor: accentColors.find(c => c.name === accentColor)?.color }}
            >
              Botón Principal
            </Button>
            <div 
              className="px-4 py-2 rounded-lg border-2 font-medium transition-colors"
              style={{ 
                borderColor: accentColors.find(c => c.name === accentColor)?.color,
                color: accentColors.find(c => c.name === accentColor)?.color
              }}
            >
              Elemento destacado
            </div>
            <div className="px-4 py-2 bg-gray-800 rounded-lg font-medium text-gray-300 hover:text-white transition-colors"
                 style={{ 
                   '--hover-color': accentColors.find(c => c.name === accentColor)?.color
                 } as any}
                 onMouseEnter={(e) => {
                   e.currentTarget.style.color = accentColors.find(c => c.name === accentColor)?.color || '';
                 }}
                 onMouseLeave={(e) => {
                   e.currentTarget.style.color = '';
                 }}>
              Efecto Hover (pasa el mouse)
            </div>
          </div>
        </div>
      </Card>

      {/* Información */}
      <Card className="p-6 bg-blue-900/20 border-blue-800">
        <div className="flex items-start gap-3">
          <div className="text-blue-400 text-xl">ℹ️</div>
          <div>
            <h3 className="font-semibold text-blue-100 mb-2">
              Aplicación automática
            </h3>
            <p className="text-blue-200 text-sm">
              Tu color de acento se aplica automáticamente a:
            </p>
            <ul className="text-blue-200 text-sm mt-2 space-y-1">
              <li>• Elementos del menú lateral al hacer hover</li>
              <li>• Botones principales y elementos destacados</li>
              <li>• Navegación de ajustes y submenús</li>
              <li>• Indicadores de estado y progreso</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}