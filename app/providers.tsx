"use client";

import AOS from "aos";
import { useEffect } from "react";
import { ToastContainer } from "react-toastify";

export default function Providers() {
  useEffect(() => {
    AOS.init({ duration: 1000, once: true });
  }, []);

  return (
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
  );
}
