/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  async headers() {
    return [
      {
        // Aplicar headers a todas las rutas
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "connect-src 'self' https://xgjmgsuggybvsxosgfqi.supabase.co",
              "img-src 'self' data: https://xgjmgsuggybvsxosgfqi.supabase.co",
              "font-src 'self'",
            ].join('; ')
          }
        ]
      }
    ]
  }
}

module.exports = nextConfig
