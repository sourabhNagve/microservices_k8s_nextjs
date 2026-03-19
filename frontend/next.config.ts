import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        port: '',
        pathname: '/a/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        port: '',
        pathname: '**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '**',
      },
      {
        protocol: 'https',
        hostname: 'i.imgur.com',
        port: '',
        pathname: '**',
      },
      {
        protocol: 'https',
        hostname: 'cdn.pixabay.com',
        port: '',
        pathname: '**',
      },
        {
        protocol: 'https',
        hostname: 'example.com',
      },
      // ✅ Add any other image hostnames your products use
      {
        protocol: 'https',
        hostname: '*.amazonaws.com',  // if using S3
      },
      {
        protocol: 'https',
        hostname: '*.cloudinary.com', // if using Cloudinary
      },
      {
        protocol: 'http',
        hostname: 'localhost',
      },
        {
        protocol: 'https',
        hostname: '**',  // ✅ allows all https image sources
      },
      {
        protocol: 'http',
        hostname: '**',  // ✅ allows all http image sources
      },
    ],

  },
  experimental: {
    optimizeCss: true,
  },
};

export default nextConfig;
