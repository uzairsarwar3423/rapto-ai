"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { X, ZoomIn } from "lucide-react";

interface ChangelogScreenshotProps {
  src: string;
  alt: string;
}

export function ChangelogScreenshot({ src, alt }: ChangelogScreenshotProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Close lightbox on Escape keypress
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Disable body scroll when lightbox is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  return (
    <>
      {/* Thumbnail */}
      <div
        onClick={() => setIsOpen(true)}
        className="group relative w-full rounded-lg overflow-hidden border border-[var(--color-border)] cursor-zoom-in mt-4 bg-[var(--color-surface)] shadow-sm hover:shadow transition-all duration-200"
      >
        <Image
          src={src}
          alt={alt}
          width={800}
          height={450}
          className="w-full h-auto object-cover max-h-[360px] transition-transform duration-300 group-hover:scale-[1.015]"
          loading="lazy"
        />
        {/* Zoom Overlay Indicator */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 flex items-center justify-center transition-colors duration-200">
          <div className="h-9 w-9 rounded-full bg-white/90 shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <ZoomIn className="w-4.5 h-4.5 text-[var(--color-foreground)]" />
          </div>
        </div>
      </div>

      {/* Lightbox Modal */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/85 cursor-zoom-out"
          >
            {/* Close Button */}
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer select-none"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Image Frame */}
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="relative max-w-[90vw] max-h-[90vh] bg-white rounded-lg overflow-hidden border border-white/10 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={src}
                alt={alt}
                className="max-w-[90vw] max-h-[90vh] object-contain select-none"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
