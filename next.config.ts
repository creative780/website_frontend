/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      // Existing hosts
      { protocol: 'https', hostname: 'storage.googleapis.com', pathname: '/**' },
      { protocol: 'https', hostname: 'scontent.fisb1-2.fna.fbcdn.net', pathname: '/**' },
      { protocol: 'https', hostname: 'encrypted-tbn0.gstatic.com', pathname: '/**' },
      { protocol: 'https', hostname: 'i.pravatar.cc', pathname: '/**' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com', pathname: '/**' },

      // Django dev hosts (localhost + 127.0.0.1)
      // Your error shows: http://127.0.0.1:8000/media/uploads/...
      { protocol: 'http', hostname: '127.0.0.1', port: '8000', pathname: '/media/**' },
      { protocol: 'http', hostname: '127.0.0.1', port: '8000', pathname: '/uploads/**' }, // optional, if used anywhere
      { protocol: 'http', hostname: 'localhost',  port: '8000', pathname: '/media/**' },
      { protocol: 'http', hostname: 'localhost',  port: '8000', pathname: '/uploads/**' },
    ],
  },
};

module.exports = nextConfig;
