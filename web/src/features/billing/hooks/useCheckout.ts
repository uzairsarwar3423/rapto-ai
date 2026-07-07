import { useState, useCallback, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { createCheckoutSession } from "../api/billing.api";
import { initializePaddle, Paddle } from "@paddle/paddle-js";

type CheckoutState = "idle" | "redirecting" | "error";

interface UseCheckoutReturn {
  startCheckout: (planId: string, interval: "month" | "year") => void;
  checkoutState: CheckoutState;
  checkoutError: string | null;
}

/**
 * useCheckout — creates a Paddle Checkout session and opens overlay.
 */
export function useCheckout(): UseCheckoutReturn {
  const [checkoutState, setCheckoutState] = useState<CheckoutState>("idle");
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [paddle, setPaddle] = useState<Paddle>();

  // Initialize Paddle on mount
  useEffect(() => {
    initializePaddle({
      environment:
        process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT === "sandbox"
          ? "sandbox"
          : "production",
      token: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN!,
    }).then((paddleInstance) => {
      if (paddleInstance) setPaddle(paddleInstance);
    });
  }, []);

  const mutation = useMutation({
    mutationFn: ({
      planId,
      interval,
    }: {
      planId: string;
      interval: "month" | "year";
    }) => createCheckoutSession(planId, interval),
    onMutate: () => {
      setCheckoutState("redirecting");
      setCheckoutError(null);
    },
    onSuccess: (data) => {
      if (paddle && data.transactionId) {
        paddle.Checkout.open({
          transactionId: data.transactionId,
        });
        setCheckoutState("idle"); // reset state since overlay opened
      } else if (data.checkoutUrl) {
        // Fallback to hosted checkout if paddle JS failed to load
        window.location.href = data.checkoutUrl;
      } else {
        setCheckoutState("error");
        setCheckoutError("No checkout URL or transaction ID returned.");
      }
    },
    onError: (err: any) => {
      setCheckoutState("error");
      setCheckoutError(
        err?.response?.data?.error?.message ||
          err?.response?.data?.error ||
          "Couldn't start checkout — please try again."
      );
      setTimeout(() => setCheckoutState("idle"), 2000);
    },
  });

  const startCheckout = useCallback(
    (planId: string, interval: "month" | "year") => {
      if (checkoutState !== "idle") return;
      mutation.mutate({ planId, interval });
    },
    [checkoutState, mutation]
  );

  return { startCheckout, checkoutState, checkoutError };
}
