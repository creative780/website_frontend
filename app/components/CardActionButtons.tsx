"use client";

import React from "react";
import { FaHeart, FaRegHeart } from "react-icons/fa";
import { IoCartOutline, IoCart } from "react-icons/io5";

type Props = {
  isFavorite: boolean;
  isInCart: boolean;
  onToggleFavorite: (e: React.MouseEvent) => void;
  onAddToCart: (e: React.MouseEvent) => void;
  className?: string;
};

/**
 * Glass-style vertical icon stack (top-right).
 * Hidden by default; shown on hover/focus-within of parent `.group`.
 * Brand color: #891F1A
 */
export default function CardActionButtons({
  isFavorite,
  isInCart,
  onToggleFavorite,
  onAddToCart,
  className = "",
}: Props) {
  return (
    <div
      className={[
        "absolute top-3 right-3 z-30 flex flex-col gap-2",
        "opacity-0 -translate-y-1 pointer-events-none",
        "transition-all duration-200",
        "group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto",
        "group-focus-within:opacity-100 group-focus-within:translate-y-0 group-focus-within:pointer-events-auto",
        className,
      ].join(" ")}
    >
      {/* Favourite */}
      <button
        aria-label="Toggle favourite"
        onClick={onToggleFavorite}
        className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md border border-white/30 shadow-md flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-[#891F1A]"
      >
        {isFavorite ? (
          <FaHeart className="text-[#891F1A]" />
        ) : (
          <FaRegHeart className="text-[#891F1A]" />
        )}
      </button>

      {/* Cart */}
      <button
        aria-label={isInCart ? "Remove from cart" : "Add to cart"}
        onClick={onAddToCart}
        className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md border border-white/30 shadow-md flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-[#891F1A]"
      >
        {isInCart ? (
          <IoCart className="text-[#891F1A]" />
        ) : (
          <IoCartOutline className="text-[#891F1A]" />
        )}
      </button>
    </div>
  );
}
