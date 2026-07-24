"use client";

import React from "react";
import { Zap, Info, Lock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useTeam } from "@/features/team/hooks/useTeam";
import { useUpdateTeamSettings } from "@/features/team/hooks/useUpdateTeamSettings";
import { useIntegrations } from "@/features/integrations/hooks/useIntegrations";

export type AutoSyncProvider = "JIRA" | "LINEAR" | "NOTION";

interface ProviderOption {
  id: AutoSyncProvider;
  name: string;
  description: string;
}

const PROVIDERS: ProviderOption[] = [
  { id: "JIRA", name: "Jira", description: "Automatically create Jira issues for extracted action items" },
  { id: "LINEAR", name: "Linear", description: "Automatically create Linear issues for extracted action items" },
  { id: "NOTION", name: "Notion", description: "Automatically create Notion database pages for extracted action items" },
];

export function AutoSyncSettings() {
  const { team, isLoading: isTeamLoading } = useTeam();
  const { integrations, isLoading: isIntegrationsLoading } = useIntegrations();
  const { updateSettings, isUpdating } = useUpdateTeamSettings();

  const settings = team?.settings || {
    autoSyncEnabled: false,
    autoSyncProviders: [],
  };

  const activeProvidersSet = new Set(
    (integrations || []).filter((i) => i.isActive).map((i) => i.provider)
  );

  const handleMasterToggle = (enabled: boolean) => {
    updateSettings({
      autoSyncEnabled: enabled,
      autoSyncProviders: enabled ? settings.autoSyncProviders : [],
    });
  };

  const handleProviderToggle = (providerId: AutoSyncProvider, enabled: boolean) => {
    const currentProviders = new Set(settings.autoSyncProviders || []);
    if (enabled) {
      currentProviders.add(providerId);
    } else {
      currentProviders.delete(providerId);
    }
    updateSettings({
      autoSyncEnabled: settings.autoSyncEnabled,
      autoSyncProviders: Array.from(currentProviders) as AutoSyncProvider[],
    });
  };

  if (isTeamLoading || isIntegrationsLoading) {
    return (
      <div className="p-6 rounded-xl border bg-card/50 backdrop-blur animate-pulse h-48" />
    );
  }

  return (
    <div className="p-6 rounded-xl border bg-card shadow-sm space-y-6">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Zap className="size-5 text-amber-500" />
            <h3 className="text-lg font-semibold tracking-tight">
              Extraction-Triggered Auto-Sync
            </h3>
            <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/20">
              Pro Feature
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Automatically create tickets in your connected tools as soon as high-confidence action items are extracted from your meetings.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">
            {settings.autoSyncEnabled ? "Enabled" : "Disabled"}
          </span>
          <Switch
            checked={settings.autoSyncEnabled || false}
            onCheckedChange={handleMasterToggle}
            disabled={isUpdating}
          />
        </div>
      </div>

      {settings.autoSyncEnabled && (
        <div className="pt-4 border-t space-y-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Auto-Sync Target Destinations
          </h4>
          <div className="grid gap-3">
            {PROVIDERS.map((provider) => {
              const isConnected = activeProvidersSet.has(provider.id);
              const isChecked = (settings.autoSyncProviders || []).includes(provider.id);

              return (
                <div
                  key={provider.id}
                  className={`flex items-center justify-between p-4 rounded-lg border transition-all ${
                    isConnected ? "bg-background" : "bg-muted/40 opacity-75"
                  }`}
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{provider.name}</span>
                      {!isConnected && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="secondary" className="text-[10px] gap-1 px-1.5 py-0">
                                <Lock className="size-3" /> Not Connected
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">Connect {provider.name} above to enable auto-sync</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{provider.description}</p>
                  </div>
                  <Switch
                    checked={isChecked && isConnected}
                    onCheckedChange={(checked) => handleProviderToggle(provider.id, checked)}
                    disabled={!isConnected || isUpdating}
                  />
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-2 p-3 rounded-md bg-muted/50 text-xs text-muted-foreground">
            <Info className="size-4 text-blue-500 shrink-0" />
            <span>
              Auto-sync only applies to newly extracted action items with confidence &ge; 50%. Manual sync remains available for all items.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
