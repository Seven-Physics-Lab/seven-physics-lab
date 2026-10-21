/** @type {import('next').NextConfig} */
const nextConfig = {
  /* A static export: `npm run build` writes a plain `out/` folder that any
   * host will serve — Vercel, Netlify, GitHub Pages or a school server.
   * If the site lives in a subfolder, set basePath below, e.g. '/physics'. */
  output: 'export',
  // basePath: '/physics',
  images: { unoptimized: true },
  trailingSlash: true,
};
export default nextConfig;
