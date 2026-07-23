"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

export interface IntegrationHealthBadgeProps {
    isActive: boolean;
    consecutiveErrors: number;
    lastError?: string | null;
    className?: string;
}

export function IntegrationHealthBadge({
    isActive,
    consecutiveErrors,
    lastError,
    className = "",
}: IntegrationHealthBadgeProps) {
    if (!isActive || consecutiveErrors >= 5) {
        return (
            <Badge
                variant="outline"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-red-500/10 text-red-400 border-red-500/20 rounded-md ${className}`}
                title={lastError || "Integration disconnected after repeated failures"}
            >
                <XCircle className="w-3.5 h-3.5" />
                <span>Disconnected — reconnect required</span>
            </Badge>
        );
    }

    if (consecutiveErrors > 0) {
        return (
            <Badge
                variant="outline"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-amber-500/10 text-amber-400 border-amber-500/20 rounded-md ${className}`}
                title={lastError || `Having trouble connecting (${consecutiveErrors} consecutive errors)`}
            >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Having trouble connecting</span>
            </Badge>
        );
    }

    return (
        <Badge
            variant="outline"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-emerald-500/10 text-emerald-400 border-emerald-500/20 rounded-md ${className}`}
        >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Connected</span>
        </Badge>
    );
}
