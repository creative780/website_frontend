// app/components/SafeImage.tsx
"use client";

import Image, { ImageProps } from "next/image";
import React, { ImgHTMLAttributes } from "react";

/**
 * SafeImage: wraps next/image, blocks right-click/drag, and
 * forwards Tailwind classes to the actual <img>.
 *
 * - Use `className` for the IMAGE (object-cover, rounded, transitions, etc.)
 * - Use `wrapperClassName` for the WRAPPER sizing/positioning when needed.
 * - `overlay` (default true) adds an invisible layer that intercepts clicks.
 */
type SafeImageProps = ImageProps & {
  wrapperClassName?: string;
  overlay?: boolean;
};

export default function SafeImage({
  className = "",
  wrapperClassName = "",
  overlay = true,
  alt,
  ...props
}: SafeImageProps) {
  return (
    <div
      className={`relative select-none ${wrapperClassName}`}
      onContextMenu={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      onTouchStart={(e) => e.preventDefault()}
    >
      {overlay && <div className="absolute inset-0 z-10" />}
      <Image alt={alt} draggable={false} className={className} {...props} />
    </div>
  );
}

/**
 * SafeImg: same idea for legacy places using native <img>.
 *
 * - `className` styles the IMG
 * - `wrapperClassName` styles the wrapper
 */
export type SafeImgProps = ImgHTMLAttributes<HTMLImageElement> & {
  wrapperClassName?: string;
  overlay?: boolean;
};

export function SafeImg({
  className = "",
  wrapperClassName = "",
  overlay = true,
  alt = "",
  ...props
}: SafeImgProps) {
  return (
    <div
      className={`relative select-none ${wrapperClassName}`}
      onContextMenu={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      onTouchStart={(e) => e.preventDefault()}
    >
      {overlay && <div className="absolute inset-0 z-10" />}
      <img alt={alt} draggable={false} className={className} {...props} />
    </div>
  );
}
