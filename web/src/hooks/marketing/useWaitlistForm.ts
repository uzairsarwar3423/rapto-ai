"use client";

/**
 * useWaitlistForm.ts
 * Manages waitlist signup form state, validation, and submission logic.
 * Returns fields, errors, status, and handlers.
 */

import { useState, useCallback } from "react";

export type SubmitStatus = "idle" | "loading" | "success" | "error";

export interface WaitlistFormFields {
  name: string;
  email: string;
  company: string;
  teamSize: string;
  role: string;
}

export interface WaitlistFormErrors {
  name?: string;
  email?: string;
  company?: string;
  teamSize?: string;
  role?: string;
}

const INITIAL_FIELDS: WaitlistFormFields = {
  name: "",
  email: "",
  company: "",
  teamSize: "",
  role: "",
};

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validate(fields: WaitlistFormFields): WaitlistFormErrors {
  const errors: WaitlistFormErrors = {};

  if (!fields.name.trim()) errors.name = "Your name is required";
  else if (fields.name.trim().length < 2) errors.name = "Name must be at least 2 characters";

  if (!fields.email.trim()) errors.email = "Work email is required";
  else if (!validateEmail(fields.email)) errors.email = "Please enter a valid email address";

  if (!fields.teamSize) errors.teamSize = "Please select your team size";
  if (!fields.role) errors.role = "Please select your role";

  return errors;
}

async function submitToWaitlist(fields: WaitlistFormFields): Promise<void> {
  const response = await fetch("/api/waitlist", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(fields),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Something went wrong. Please try again.");
  }
}

export function useWaitlistForm() {
  const [fields, setFields] = useState<WaitlistFormFields>(INITIAL_FIELDS);
  const [errors, setErrors] = useState<WaitlistFormErrors>({});
  const [touched, setTouched] = useState<Partial<Record<keyof WaitlistFormFields, boolean>>>({});
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const { name, value } = e.target;
      setFields((prev) => ({ ...prev, [name]: value }));

      // Clear error when user starts typing
      if (errors[name as keyof WaitlistFormErrors]) {
        setErrors((prev) => ({ ...prev, [name]: undefined }));
      }
    },
    [errors]
  );

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
      const { name } = e.target;
      setTouched((prev) => ({ ...prev, [name]: true }));

      // Validate individual field on blur
      const fieldErrors = validate(fields);
      if (fieldErrors[name as keyof WaitlistFormErrors]) {
        setErrors((prev) => ({
          ...prev,
          [name]: fieldErrors[name as keyof WaitlistFormErrors],
        }));
      }
    },
    [fields]
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      // Mark all fields as touched
      setTouched({ name: true, email: true, company: true, teamSize: true, role: true });

      const fieldErrors = validate(fields);
      if (Object.keys(fieldErrors).length > 0) {
        setErrors(fieldErrors);
        return;
      }

      setStatus("loading");
      setErrorMessage("");

      try {
        await submitToWaitlist(fields);
        setStatus("success");
      } catch (err) {
        setStatus("error");
        setErrorMessage(
          err instanceof Error ? err.message : "Something went wrong. Please try again."
        );
      }
    },
    [fields]
  );

  const reset = useCallback(() => {
    setFields(INITIAL_FIELDS);
    setErrors({});
    setTouched({});
    setStatus("idle");
    setErrorMessage("");
  }, []);

  return {
    fields,
    errors,
    touched,
    status,
    errorMessage,
    handleChange,
    handleBlur,
    handleSubmit,
    reset,
    isLoading: status === "loading",
    isSuccess: status === "success",
    isError: status === "error",
  };
}
