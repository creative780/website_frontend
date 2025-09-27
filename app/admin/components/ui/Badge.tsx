// components/ui/Badge.tsx
import React from "react";

export const Badge = ({ children, className = "", ...props }) => {
  return (
    <span
      className={`inline-block text-xs font-medium px-3 py-1 rounded-full bg-gray-100 text-gray-800 ${className}`}
      {...props}
    >
      {children}
    </span>
  );
};
