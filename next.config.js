/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  async headers() {
    return [
      {
        // Aplicar headers a todas las rutas
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            // Nota: en producción Next.js no usa eval/hot-update, pero permitimos
            // 'unsafe-eval' y 'unsafe-inline' temporalmente hasta eliminar cualquier dependencia
            // que lo requiera. Además habilitamos blob:/ws:/wss: y https: para conexiones y workers.
            value: [
              "default-src 'self' https: data: blob:",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https: blob:",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' https: data: blob:",
              "font-src 'self' https: data:",
              "connect-src 'self' https: wss: ws: https://xgjmgsuggybvsxosgfqi.supabase.co wss://xgjmgsuggybvsxosgfqi.supabase.co",
              "worker-src 'self' blob:",
              "frame-src 'self' https:",
              // opcionalmente forzar https en recursos inseguros
              'upgrade-insecure-requests'
            ].join('; ')
          }
        ]
      }
    ]
  }
}

module.exports = nextConfig
