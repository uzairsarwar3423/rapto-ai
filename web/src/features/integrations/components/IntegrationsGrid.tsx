"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useIntegrations } from "../hooks/useIntegrations";
import { useOAuthConnect } from "../hooks/useOAuthConnect";
import { useDisconnectIntegration } from "../hooks/useDisconnectIntegration";
import { useTestConnection } from "../hooks/useTestConnection";
import { useIntegrationConfig } from "../hooks/useIntegrationConfig";
import { toast } from "sonner";
import { useSaveState } from "@/shared/hooks/useSaveState";

import { INTEGRATION_PROVIDERS, IntegrationProviderConfig } from "../data/providers.config";
import { IntegrationsGridHeader } from "./IntegrationsGridHeader";
import { IntegrationSection } from "./IntegrationSection";
import { IntegrationRow } from "./IntegrationRow";
import { ConnectIntegrationSheet } from "./ConnectIntegrationSheet";
import { IntegrationConfigSheet } from "./IntegrationConfigSheet";
import { DisconnectIntegrationAlert } from "./DisconnectIntegrationAlert";
import { CalendarEventsPreviewSheet } from "./CalendarEventsPreviewSheet";

// Config form imports
import { SlackConfigForm } from "./IntegrationConfigForm/SlackConfigForm";
import { JiraConfigForm } from "./IntegrationConfigForm/JiraConfigForm";
import { NotionConfigForm } from "./IntegrationConfigForm/NotionConfigForm";
import { GoogleCalendarConfigForm } from "./IntegrationConfigForm/GoogleCalendarConfigForm";

import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { IntegrationBadgeStatus } from "./IntegrationStatusBadge";
import { JiraIntegration } from "./JiraIntegration";
import { SlackIntegration } from "./SlackIntegration";
import { LinearIntegration } from "./LinearIntegration";

interface ConfigSheetWrapperProps {
  provider: IntegrationProviderConfig;
  integration: any;
  onClose: () => void;
  onOpenPreview: () => void;
}

function ConfigSheetWrapper({
  provider,
  integration,
  onClose,
  onOpenPreview,
}: ConfigSheetWrapperProps) {
  const isCalendar = provider.scope === "personal";
  const { options = [], isLoadingOptions, saveAsync } = useIntegrationConfig(
    provider.id,
    isCalendar
  );
  const { state: saveState, run } = useSaveState();

  const getInitialValue = () => {
    if (!integration?.metadata) return "";
    const meta = integration.metadata;
    if (provider.id === "SLACK") return meta.channelId || "";
    if (provider.id === "JIRA") return meta.projectKey || "";
    if (provider.id === "LINEAR") return meta.linearTeamId || "";
    if (provider.id === "NOTION") return meta.databaseId || "";
    return "";
  };

  const handleFormSubmit = (values: any) => {
    let config: Record<string, any> = {};
    if (provider.id === "SLACK") config = { channelId: values.channelId };
    if (provider.id === "JIRA") config = { projectKey: values.projectKey };
    if (provider.id === "LINEAR") config = { linearTeamId: values.linearTeamId };
    if (provider.id === "NOTION") config = { databaseId: values.databaseId };
    if (provider.id === "GOOGLE_CALENDAR") config = values;

    run(() => saveAsync(config));
  };

  return (
    <IntegrationConfigSheet
      open={true}
      onClose={onClose}
      providerId={provider.id}
      providerName={provider.name}
      state={saveState}
    >
      {provider.id === "SLACK" && (
        <SlackConfigForm
          initialValue={getInitialValue()}
          options={options}
          isLoading={isLoadingOptions || saveState === "saving"}
          onSubmit={handleFormSubmit}
        />
      )}
      {provider.id === "JIRA" && (
        <JiraConfigForm
          initialValue={getInitialValue()}
          options={options}
          isLoading={isLoadingOptions || saveState === "saving"}
          onSubmit={handleFormSubmit}
        />
      )}
      {provider.id === "NOTION" && (
        <NotionConfigForm
          initialValue={getInitialValue()}
          options={options}
          isLoading={isLoadingOptions || saveState === "saving"}
          onSubmit={handleFormSubmit}
        />
      )}
      {provider.id === "GOOGLE_CALENDAR" && (
        <GoogleCalendarConfigForm
          initialCalendarId={integration?.calendarId || "primary"}
          initialSyncEnabled={integration?.syncEnabled ?? true}
          isLoading={isLoadingOptions || saveState === "saving"}
          onSubmit={handleFormSubmit}
          onOpenPreview={onOpenPreview}
        />
      )}
    </IntegrationConfigSheet>
  );
}

export function IntegrationsGrid() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data, isLoading, error, refetch: refetchIntegrations } = useIntegrations();
  const { connect, connectingProvider } = useOAuthConnect();
  const disconnectMutation = useDisconnectIntegration();
  const testMutation = useTestConnection();

  const [connectProvider, setConnectProvider] = useState<IntegrationProviderConfig | null>(null);
  const [configProvider, setConfigProvider] = useState<IntegrationProviderConfig | null>(null);
  const [disconnectProvider, setDisconnectProvider] = useState<IntegrationProviderConfig | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // Inline messaging for tests, connections, and disconnections
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [rowSuccesses, setRowSuccesses] = useState<Record<string, string>>({});

  // Sync to/from URL config parameters
  useEffect(() => {
    const configure = searchParams.get("configure");
    if (configure) {
      const found = INTEGRATION_PROVIDERS.find((p) => p.id === configure.toUpperCase());
      if (found) {
        setConfigProvider(found);
      }
    } else {
      setConfigProvider(null);
    }
  }, [searchParams]);

  // Handle test triggers from URL parameters (e.g. from Command Menu)
  useEffect(() => {
    const test = searchParams.get("test");
    if (test) {
      const found = INTEGRATION_PROVIDERS.find((p) => p.id === test.toUpperCase());
      if (found) {
        // Strip the test param from the URL immediately
        const params = new URLSearchParams(window.location.search);
        params.delete("test");
        router.replace(`${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`);

        // Run connection test
        handleTestConnection(found);
      }
    }
  }, [searchParams, router]);

  // Clean URL query parameters and handle auto-opening + toasts on mount
  useEffect(() => {
    const connected = searchParams.get("connected");
    const errorParam = searchParams.get("error");
    const providerParam = searchParams.get("provider") || searchParams.get("connected");

    if (connected) {
      const providerId = connected.toUpperCase();
      const found = INTEGRATION_PROVIDERS.find((p) => p.id === providerId);
      if (found) {
        // Strip the connected query param
        const params = new URLSearchParams(window.location.search);
        params.delete("connected");
        params.delete("provider");
        router.replace(`${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`);

        toast.success(`${found.name} connected successfully!`);

        // Open config sheet after 200ms delay
        const timer = setTimeout(() => {
          handleConfigure(found);
        }, 200);
        return () => clearTimeout(timer);
      }
    }

    if (errorParam) {
      // Strip query params
      const params = new URLSearchParams(window.location.search);
      params.delete("error");
      params.delete("provider");
      router.replace(`${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`);

      if (providerParam) {
        const providerKey = providerParam.toUpperCase();
        const found = INTEGRATION_PROVIDERS.find((p) => p.id === providerKey);
        const errMsg = `Connection to ${found ? found.name : providerParam} failed: ${errorParam.replace(/_/g, " ")}`;
        
        setRowErrors((prev) => ({
          ...prev,
          [providerKey]: errMsg,
        }));

        const timer = setTimeout(() => {
          setRowErrors((prev) => {
            const next = { ...prev };
            delete next[providerKey];
            return next;
          });
        }, 8000);
        return () => clearTimeout(timer);
      } else {
        toast.error(`Connection failed: ${errorParam.replace(/_/g, " ")}`);
      }
    }
  }, [searchParams, router]);

  // Listen for connection test results to show inline on rows
  useEffect(() => {
    const handleTestResult = (e: Event) => {
      const { provider, type, message } = (e as CustomEvent).detail;
      const providerKey = provider.toUpperCase();

      if (type === "success") {
        setRowSuccesses((prev) => ({
          ...prev,
          [providerKey]: message,
        }));
        const timer = setTimeout(() => {
          setRowSuccesses((prev) => {
            const next = { ...prev };
            delete next[providerKey];
            return next;
          });
        }, 8000);
        return () => clearTimeout(timer);
      } else {
        setRowErrors((prev) => ({
          ...prev,
          [providerKey]: message,
        }));
        const timer = setTimeout(() => {
          setRowErrors((prev) => {
            const next = { ...prev };
            delete next[providerKey];
            return next;
          });
        }, 8000);
        return () => clearTimeout(timer);
      }
    };

    window.addEventListener("integration-test-result", handleTestResult);
    return () => window.removeEventListener("integration-test-result", handleTestResult);
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="space-y-8 mt-10">
          <div className="space-y-4">
            <Skeleton className="h-4 w-40" />
            <div className="divide-y divide-muted/10 border border-muted/20 rounded-lg bg-card overflow-hidden">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3 w-1/3">
                    <Skeleton className="w-6 h-6 rounded-md" />
                    <div className="space-y-1.5 flex-1">
                      <Skeleton className="h-4 w-1/2" />
                      <Skeleton className="h-3 w-3/4" />
                    </div>
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="flex items-center gap-3 p-5 text-destructive select-none">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm font-sans font-medium">
            Failed to load integrations. Please try refreshing the page.
          </span>
        </CardContent>
      </Card>
    );
  }

  const teamList = data?.teamIntegrations || [];
  const userList = data?.userIntegrations || [];

  const getTeamIntegration = (provider: string) => {
    return teamList.find((t) => t.provider === provider);
  };

  const getUserIntegration = (provider: string) => {
    return userList.find((u) => u.provider === provider);
  };

  const getIntegrationRecord = (providerId: string) => {
    const provider = INTEGRATION_PROVIDERS.find((p) => p.id === providerId);
    if (provider?.scope === "personal") {
      return getUserIntegration(providerId);
    }
    return getTeamIntegration(providerId);
  };

  const getStatus = (providerId: string): IntegrationBadgeStatus => {
    const integration = getIntegrationRecord(providerId);
    if (!integration || !integration.isActive) return "NOT_CONNECTED";
    if (integration.consecutiveErrors && integration.consecutiveErrors > 0) {
      return "NEEDS_REAUTH";
    }
    return "CONNECTED";
  };

  const connectedCount =
    teamList.filter((t) => t.isActive).length + userList.filter((u) => u.isActive).length;
  const totalCount = INTEGRATION_PROVIDERS.filter((p) => !p.comingSoon).length;

  const handleConfigure = (provider: IntegrationProviderConfig) => {
    setConfigProvider(provider);
    const params = new URLSearchParams(window.location.search);
    params.set("configure", provider.id.toLowerCase());
    router.replace(`${window.location.pathname}?${params.toString()}`);
  };

  const handleCloseConfigure = () => {
    setConfigProvider(null);
    const params = new URLSearchParams(window.location.search);
    params.delete("configure");
    const queryStr = params.toString();
    router.replace(`${window.location.pathname}${queryStr ? `?${queryStr}` : ""}`);
  };

  const handleConnectClick = (provider: IntegrationProviderConfig) => {
    setConnectProvider(provider);
  };

  const handleDisconnectClick = (provider: IntegrationProviderConfig) => {
    setDisconnectProvider(provider);
  };

  const confirmDisconnect = () => {
    if (!disconnectProvider) return;
    const isCalendar = disconnectProvider.scope === "personal";
    const providerId = disconnectProvider.id;

    disconnectMutation.mutate(
      { provider: providerId, isCalendar },
      {
        onSuccess: () => {
          setDisconnectProvider(null);
          toast.success(`${disconnectProvider.name} disconnected successfully`);
        },
        onError: (err: any) => {
          setDisconnectProvider(null);
          const errMsg = err?.response?.data?.error?.message || "Failed to disconnect";
          setRowErrors((prev) => ({
            ...prev,
            [providerId]: errMsg,
          }));
          setTimeout(() => {
            setRowErrors((prev) => {
              const next = { ...prev };
              delete next[providerId];
              return next;
            });
          }, 8000);
        },
      }
    );
  };

  const handleTestConnection = (provider: IntegrationProviderConfig) => {
    const isCalendar = provider.scope === "personal";
    const providerId = provider.id;

    // Clear previous inline messages for this row
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[providerId];
      return next;
    });
    setRowSuccesses((prev) => {
      const next = { ...prev };
      delete next[providerId];
      return next;
    });

    testMutation.mutate({ provider: providerId, isCalendar });
  };

  const handleReconnect = (provider: IntegrationProviderConfig) => {
    // Reconnect routes back to OAuth
    connect(provider.id);
  };

  const teamProviders = INTEGRATION_PROVIDERS.filter((p) => p.scope === "team");
  const calendarProviders = INTEGRATION_PROVIDERS.filter((p) => p.scope === "personal");

  return (
    <div className="space-y-8 select-none">
      {/* Header */}
      <IntegrationsGridHeader connectedCount={connectedCount} />

      {/* Grid Stack */}
      <div className="space-y-6 mt-6">
        {/* Section 1: Team Workspace Integrations */}
        <IntegrationSection label="Team Workspace Integrations">
          {teamProviders.map((p) => {
            const record = getTeamIntegration(p.id);
            const status = getStatus(p.id);

            // ── JIRA: use the self-contained JiraIntegration card ─────────────
            // It handles all 4 states (NOT_CONNECTED / UNCONFIGURED / CONFIGURED / ERROR)
            // plus connect, configure sheet, and disconnect dialog internally.
            if (p.id === "JIRA") {
              return (
                <div key="JIRA" className="px-2 py-2">
                  <JiraIntegration
                    integration={record as any}
                    onRefresh={() => refetchIntegrations()}
                  />
                </div>
              );
            }

            // ── SLACK: use the self-contained SlackIntegration card ─────────────
            if (p.id === "SLACK") {
              return (
                <div key="SLACK" className="px-2 py-2">
                  <SlackIntegration
                    integration={record as any}
                    onRefresh={() => refetchIntegrations()}
                  />
                </div>
              );
            }

            // ── LINEAR: use the self-contained LinearIntegration card ─────────────
            if (p.id === "LINEAR") {
              return (
                <div key="LINEAR" className="px-2 py-2">
                  <LinearIntegration
                    integration={record as any}
                    onRefresh={() => refetchIntegrations()}
                  />
                </div>
              );
            }

            // ── All other providers: use the generic IntegrationRow ────────────
            return (
              <IntegrationRow
                key={p.id}
                providerId={p.id}
                name={p.name}
                description={p.description}
                status={status}
                lastSyncedAt={record?.lastSyncedAt || null}
                comingSoon={p.comingSoon}
                onConnect={() => handleConnectClick(p)}
                onConfigure={() => handleConfigure(p)}
                onTest={() => handleTestConnection(p)}
                onReconnect={() => handleReconnect(p)}
                onDisconnect={() => handleDisconnectClick(p)}
                isTesting={testMutation.isPending && testMutation.variables?.provider === p.id}
                isDisconnecting={
                  disconnectMutation.isPending && disconnectMutation.variables?.provider === p.id
                }
                error={rowErrors[p.id]}
                successMessage={rowSuccesses[p.id]}
              />
            );
          })}
        </IntegrationSection>

        {/* Section 2: Calendar Integrations */}
        <IntegrationSection label="Personal Calendar Integrations">
          {calendarProviders.map((p) => {
            const record = getUserIntegration(p.id);
            const status = getStatus(p.id);
            return (
              <IntegrationRow
                key={p.id}
                providerId={p.id}
                name={p.name}
                description={p.description}
                status={status}
                lastSyncedAt={record?.lastSyncedAt || null}
                comingSoon={p.comingSoon}
                onConnect={() => handleConnectClick(p)}
                onConfigure={() => handleConfigure(p)}
                onTest={() => handleTestConnection(p)}
                onReconnect={() => handleReconnect(p)}
                onDisconnect={() => handleDisconnectClick(p)}
                isTesting={testMutation.isPending && testMutation.variables?.provider === p.id}
                isDisconnecting={
                  disconnectMutation.isPending && disconnectMutation.variables?.provider === p.id
                }
                error={rowErrors[p.id]}
                successMessage={rowSuccesses[p.id]}
              />
            );
          })}
        </IntegrationSection>
      </div>

      {/* Sheet: Connect Consent */}
      {connectProvider && (
        <ConnectIntegrationSheet
          open={!!connectProvider}
          onClose={() => setConnectProvider(null)}
          provider={connectProvider}
        />
      )}

      {/* Sheet: Configure Sheet (Isolated wrapper) */}
      {configProvider && (
        <ConfigSheetWrapper
          provider={configProvider}
          integration={getIntegrationRecord(configProvider.id)}
          onClose={handleCloseConfigure}
          onOpenPreview={() => setIsPreviewOpen(true)}
        />
      )}

      {/* Alert: Disconnect Confirmation */}
      {disconnectProvider && (
        <DisconnectIntegrationAlert
          open={!!disconnectProvider}
          onClose={() => setDisconnectProvider(null)}
          onConfirm={confirmDisconnect}
          providerName={disconnectProvider.name}
          consequence={disconnectProvider.disconnectConsequence}
          isPending={disconnectMutation.isPending}
        />
      )}

      {/* Sheet: Calendar Events Preview */}
      <CalendarEventsPreviewSheet
        open={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
      />
    </div>
  );
}
