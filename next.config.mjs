/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.shopify.com',
        pathname: '/s/files/**',
      },
      {
        protocol: 'https',
        hostname: 'img.youtube.com',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              // Only load scripts from self and Next.js internals (no unsafe-inline for scripts)
              "default-src 'self'",
              // Styles: self + Google Fonts + inline styles needed by Tailwind
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              // Fonts
              "font-src 'self' https://fonts.gstatic.com",
              // Images: self + Shopify CDN + YouTube thumbnails + data URIs
              "img-src 'self' data: https://cdn.shopify.com https://img.youtube.com https://images.unsplash.com",
              // Scripts: self + Next.js eval (required for dev HMR) — tighten in production
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              // Iframes: only YouTube
              "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
              // Connections: self + Shopify API + QStash
              "connect-src 'self' https://*.myshopify.com https://qstash.upstash.io https://*.upstash.io",
              // No object embeds
              "object-src 'none'",
              // Prevent clickjacking
              "frame-ancestors 'none'",
              // Base URI restricted to self
              "base-uri 'self'",
            ].join('; '),
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
