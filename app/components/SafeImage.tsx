// app/components/SafeImage.tsx
"use client";

import React, { forwardRef, memo } from "react";
import Image, { ImageProps } from "next/image";

/**
 * SafeImage
 * - Wraps next/image
 * - Suppresses right-click + drag (configurable)
 * - Keeps Tailwind classes on the actual <img> element
 *
 * a11y: The overlay is aria-hidden and non-focusable.
 *       Avoid using overlay on tappable/clickable images.
 */
type SafeImageProps = ImageProps & {
  /** Extra classes for the wrapper div (layout/sizing) */
  wrapperClassName?: string;
  /**
   * Adds a transparent overlay on top of the image to discourage long-press save.
   * Note: overlay intercepts pointer events; keep it off when the image is interactive.
   * Default: true (matches previous behavior)
   */
  overlay?: boolean;
  /**
   * Prevent context menu and dragging on the image. Default: true.
   * (Leaving this on does not block keyboard or screen-reader interactions.)
   */
  protect?: boolean;
};

const SafeImage = memo(
  forwardRef<HTMLDivElement, SafeImageProps>(function SafeImage(
    { className = "", wrapperClassName = "", overlay = true, protect = true, alt, ...props },
    ref
  ) {
    return (
      <div
        ref={ref}
        className={`relative select-none ${wrapperClassName}`}
        onContextMenu={protect ? (e) => e.preventDefault() : undefined}
        // Don't block mouse/touch generally; rely on draggable=false below.
        // This preserves accessibility and clickability when wrapped in links.
      >
        {overlay && (
          <div
            className="absolute inset-0 z-10"
            aria-hidden="true"
            // Overlay intentionally intercepts pointer events; keep it out of the a11y tree.
          />
        )}
        <Image
          alt={alt}
          // Prevent dragging the image to save
          draggable={protect ? false : undefined}
          // Tailwind goes to the actual <img> element rendered by next/image
          className={className}
          // Defaults that help performance unless caller overrides with `priority`
          loading={props.priority ? undefined : props.loading ?? "lazy"}
          {...props}
        />
      </div>
    );
  })
);

export default SafeImage;

/**
 * SafeImg
 * - Native <img> variant for legacy spots.
 * - Same API shape as SafeImage for wrapperClassName/overlay/protect.
 */
export type SafeImgProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  wrapperClassName?: string;
  overlay?: boolean;
  protect?: boolean;
};

export const SafeImg = memo(
  forwardRef<HTMLDivElement, SafeImgProps>(function SafeImg(
    { className = "", wrapperClassName = "", overlay = true, protect = true, alt = "", ...props },
    ref
  ) {
    return (
      <div
        ref={ref}
        className={`relative select-none ${wrapperClassName}`}
        onContextMenu={protect ? (e) => e.preventDefault() : undefined}
      >
        {overlay && <div className="absolute inset-0 z-10" aria-hidden="true" />}
        <img
          alt={alt}
          draggable={protect ? false : undefined}
          className={className}
          // Reasonable perf defaults for plain <img>
          loading={props.loading ?? "lazy"}
          decoding={(props as any)?.decoding ?? "async"}
          {...props}
        />
      </div>
    );
  })
);
