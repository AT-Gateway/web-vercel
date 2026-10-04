/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    serverExternalPackages: ["pg", "fastify", "@fastify/cors", "web-push", "undici"],
    typescript: {
        ignoreBuildErrors: true,
    },
    env: {
        // Identifies the deployed build so the client can notice a newer one.
        NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev",
    },
};

export default nextConfig;
