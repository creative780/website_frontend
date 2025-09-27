'use client';

import './globals.css';
import 'aos/dist/aos.css';
import 'react-toastify/dist/ReactToastify.css';

import AOS from 'aos';
import { useEffect } from 'react';
import { ToastContainer } from 'react-toastify';

/* Load Poppins with all required weights */
import { Poppins } from 'next/font/google';
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    AOS.init({ duration: 1000, once: true });
  }, []);

  return (
    <html lang="en" className={poppins.variable}>
      <body>
        {children}

        {/* Toast container globally mounted */}
        <ToastContainer
          position="top-center"
          autoClose={3000}
          hideProgressBar={false}
          newestOnTop
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          className="z-[9999]"
        />
      </body>
    </html>
  );
}
