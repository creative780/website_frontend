// components/ui/Card.tsx
import React from "react";

export const Card = ({ children, className = "", ...props }) => {
  return (
    <div
      className={`bg-white border border-gray-200 rounded-xl shadow-sm p-4 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
