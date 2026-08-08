/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      { source: "/", destination: "/index.html" },
      { source: "/onboarding", destination: "/onboarding.html" },
    ];
  },
};

export default nextConfig;
