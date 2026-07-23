"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/shared/lib/cache/query-keys";
import { useAuthStore } from "@/features/auth/store/auth.store";
import { fetchIntegrationsClient } from "../api/integrations.api";

export interface IntegrationHealthState {
    provider: string;
    isActive: boolean;
    consecutiveErrors: number;
    lastError: string | null;
}

export function useIntegrationHealth(provider?: string) {
    const teamId = useAuthStore((state) => state.user?.teamId) || "";

    const query = useQuery({
        queryKey: queryKeys.integrations.all(teamId),
        queryFn: fetchIntegrationsClient,
        enabled: !!teamId,
        staleTime: 60 * 1000,
    });

    const teamIntegrations = query.data?.teamIntegrations || [];
    const userIntegrations = query.data?.userIntegrations || [];

    const allIntegrations: IntegrationHealthState[] = [
        ...teamIntegrations.map((i: any) => ({
            provider: i.provider,
            isActive: i.isActive,
            consecutiveErrors: i.consecutiveErrors ?? 0,
            lastError: i.lastError ?? null,
        })),
        ...userIntegrations.map((i: any) => ({
            provider: i.provider,
            isActive: i.isActive ?? i.syncEnabled,
            consecutiveErrors: i.consecutiveErrors ?? 0,
            lastError: i.lastError ?? null,
        })),
    ];

    if (provider) {
        const found = allIntegrations.find(
            (i) => i.provider.toUpperCase() === provider.toUpperCase()
        );
        return {
            ...query,
            health: found || null,
        };
    }

    return {
        ...query,
        allHealth: allIntegrations,
    };
}
