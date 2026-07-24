import { useUpdateTeam } from './useUpdateTeam';

export function useUpdateTeamSettings() {
  const updateTeamMutation = useUpdateTeam();

  const updateSettings = (settings: Record<string, any>) => {
    return updateTeamMutation.mutateAsync({ settings });
  };

  return {
    updateSettings,
    isUpdating: updateTeamMutation.isPending,
    error: updateTeamMutation.error,
  };
}
