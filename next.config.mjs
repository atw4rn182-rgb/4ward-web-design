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
      { source: "/consultation", destination: "/consultation.html", permanent: true },
    ];
  },
  async rewrites() {
    return [
      { source: "/", destination: "/index.html" },
      { source: "/case-studies/4-elements", destination: "/case-studies/4-elements.html" },
      { source: "/examples/desert-sunrise-coffee", destination: "/examples/desert-sunrise-coffee.html" },
      { source: "/examples/new-mexico-burrito", destination: "/examples/new-mexico-burrito.html" },
      { source: "/examples/canyon-trail-outfitters", destination: "/examples/canyon-trail-outfitters.html" },
      { source: "/examples/canyon-trail-outfitters/:path*", destination: "/examples/canyon-trail-outfitters.html" },
    ];
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
        source: "/examples/desert-sunrise-coffee",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/examples/new-mexico-burrito",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/examples/canyon-trail-outfitters",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/examples/canyon-trail-outfitters/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
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
