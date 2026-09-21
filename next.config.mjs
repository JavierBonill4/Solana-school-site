/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Old URLs people may have bookmarked or linked in Discord.
  async redirects() {
    return [
      { source: "/ecosystem", destination: "/resources", permanent: true },
      { source: "/leaderboard", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
