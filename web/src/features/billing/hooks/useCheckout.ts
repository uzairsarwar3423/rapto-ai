import { useState, useCallback, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createCheckoutSession } from "../api/billing.api";
import { initializePaddle, Paddle } from "@paddle/paddle-js";

type CheckoutState = "idle" | "redirecting" | "error";

interface UseCheckoutReturn {
  startCheckout: (planId: string, interval: "month" | "year") => void;
  checkoutState: CheckoutState;
  checkoutError: string | null;
}

/**
 * Enterprise Production-Grade Paddle Checkout Hook
 *
 * Handles both overlay modal checkout and hosted checkout fallback.
 * Dynamically resolves environment (sandbox vs production) based on token prefix
 * or NEXT_PUBLIC_PADDLE_ENVIRONMENT to prevent environment mismatch CORS crashes.
 */
export function useCheckout(): UseCheckoutReturn {
  const [checkoutState, setCheckoutState] = useState<CheckoutState>("idle");
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [paddle, setPaddle] = useState<Paddle>();
  const queryClient = useQueryClient();

  // Initialize Paddle JS SDK safely on mount with completion listener
  useEffect(() => {
    const clientToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN?.trim() || "";
    const envSetting = process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT?.trim().toLowerCase();

    // Auto-detect sandbox if token starts with 'test_' or env is explicitly sandbox
    const isSandbox = envSetting === "sandbox" || clientToken.startsWith("test_");

    if (!clientToken) {
      console.warn("⚠️ NEXT_PUBLIC_PADDLE_CLIENT_TOKEN is not set — Paddle overlay checkout disabled.");
      return;
    }

    initializePaddle({
      environment: isSandbox ? "sandbox" : "production",
      token: clientToken,
      eventCallback: (event) => {
        if (event.name === "checkout.completed") {
          console.log("🎉 Paddle payment completed successfully — refreshing workspace plan");
          // Invalidate team and billing query caches immediately
          queryClient.invalidateQueries({ queryKey: ["team"] });
          queryClient.invalidateQueries({ queryKey: ["auth"] });
          queryClient.invalidateQueries({ queryKey: ["user"] });
        }
      },
    })
      .then((paddleInstance) => {
        if (paddleInstance) {
          setPaddle(paddleInstance);
        }
      })
      .catch((err) => {
        console.error("❌ Failed to initialize Paddle JS SDK:", err);
      });
  }, [queryClient]);

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
      // 1. Try Paddle Overlay Modal if SDK initialized successfully
      if (paddle && data.transactionId) {
        try {
          paddle.Checkout.open({
            transactionId: data.transactionId,
          });
          setCheckoutState("idle");
          return;
        } catch (err) {
          console.warn("⚠️ Paddle overlay open failed — redirecting to hosted checkout URL:", err);
        }
      }

      // 2. Fallback to hosted Paddle checkout URL if overlay unavailable or fails
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        setCheckoutState("error");
        setCheckoutError("No checkout URL or transaction ID returned from server.");
      }
    },
    onError: (err: any) => {
      setCheckoutState("error");
      setCheckoutError(
        err?.response?.data?.error?.message ||
          err?.response?.data?.error ||
          "Couldn't start checkout — please try again."
      );
      setTimeout(() => setCheckoutState("idle"), 4000);
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
