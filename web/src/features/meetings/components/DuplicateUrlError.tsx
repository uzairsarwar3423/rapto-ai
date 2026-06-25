"use client";

import React from "react";
import { AlertCircle } from "lucide-react";
import { motion } from "framer-motion";

interface DuplicateUrlErrorProps {
  message: string;
}

export function DuplicateUrlError({ message }: DuplicateUrlErrorProps) {
  return (
    <motion.span
      role="alert"
      initial={{ opacity: 0, y: -2 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.12, ease: "easeOut" }}
      className="inline-flex items-center gap-1 mt-1 text-xs text-foreground font-sans font-medium"
    >
      <AlertCircle className="h-3.5 w-3.5 shrink-0 text-foreground" />
      <span>{message}</span>
    </motion.span>
  );
}
