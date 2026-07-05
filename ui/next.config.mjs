/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    middlewareClientMaxBodySize: "64mb"
  },
  reactStrictMode: true
};

export default nextConfig;
