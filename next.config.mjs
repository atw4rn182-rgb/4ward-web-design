/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  compress: true,
  reactStrictMode: true,
  images: {
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    optimizePackageImports: ["@supabase/supabase-js", "@supabase/ssr"],
  },
  async redirects() {
    return [
      // Prefer the live www host’s clean homepage URL (avoid / vs /index.html duplicates).
      { source: "/index.html", destination: "/", permanent: true },
      // Consolidate clean aliases onto the canonical .html URLs used in links/canonicals.
      { source: "/quote", destination: "/quote.html", permanent: true },
      { source: "/onboarding", destination: "/onboarding.html", permanent: true },
    ];
  },
  async rewrites() {
    return [{ source: "/", destination: "/index.html" }];
  },
  async headers() {
    return [
      {
        source: "/assets/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/:path*.(js|css|svg|png|jpg|jpeg|webp|avif|mp4|woff2)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/:path*.html",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
