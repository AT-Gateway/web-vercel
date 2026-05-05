/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    serverExternalPackages: ["pg", "fastify", "@fastify/cors", "web-push", "undici"],
    typescript: {
        ignoreBuildErrors: true,
    },
};

export default nextConfig;
