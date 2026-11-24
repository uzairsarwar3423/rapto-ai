import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api/client'
import { useAuthStore } from '@/features/auth/store/auth.store'

export interface CreateTeamPayload {
  name: string
  slug: string
}

export interface SlugCheckResult {
  available: boolean
  /** The normalised slug the server checked */
  slug: string
  /** Why it is unavailable */
  reason?: 'TAKEN' | 'RESERVED' | 'INVALID'
  /** First available slug when `slug` is unavailable */
  suggestion?: string
}

export interface InviteMembersPayload {
  emails: string[]
  role?: 'MEMBER' | 'MANAGER' | 'ADMIN'
}

export const useOnboarding = () => {
  const queryClient = useQueryClient()
  // Read the store at callback time (not via a whole-store subscription): fresher
  // data, and step pages don't re-render on unrelated auth-store updates.
  const { setUser, setAccessToken } = useAuthStore.getState()

  // 1. Check if slug is available. The API always answers with the first slug that IS
  //    available (`suggestion`: base, base-1, base-2 …) when the requested one is not.
  const checkSlugMutation = useMutation({
    mutationFn: async (slug: string): Promise<SlugCheckResult> => {
      const response = await api.get<{ data: SlugCheckResult }>(`/teams/check-slug`, {
        params: { slug }
      })
      return response.data.data
    }
  })

  // 2. Create a team. The server revalidates the slug and may pick the next free one,
  //    so the returned `slug` (not the one sent) is the source of truth.
  const createTeamMutation = useMutation({
    mutationFn: async (payload: CreateTeamPayload) => {
      const response = await api.post<{ data: { id: string; name: string; slug: string; slugAdjusted?: boolean; accessToken: string | null } }>(
        '/teams',
        payload
      )
      return response.data.data
    },
    onSuccess: (data) => {
      // CRITICAL: Swap the stale JWT for the fresh one returned by the backend.
      // The old accessToken has teamId: null (signed before team creation).
      // injectTenant reads teamId from the JWT — so without this swap, the
      // very next API call (invite) will get "You must be part of a team".
      if (data.accessToken) {
        setAccessToken(data.accessToken)
      }

      // Update local auth store — no need to re-fetch, avoids step-change flicker
      const user = useAuthStore.getState().user
      if (user) {
        setUser({
          ...user,
          teamId: data.id,
          team: { id: data.id, name: data.name, slug: data.slug },
          role: 'ADMIN' // The team creator becomes OWNER/ADMIN
        })
      }
    },
    // Errors are shown inline by the create-team step (no duplicate toast).
  })

  // 2.5 Update a team
  const updateTeamMutation = useMutation({
    mutationFn: async (payload: { name?: string; slug?: string }) => {
      const response = await api.patch<{ data: { id: string; name: string; slug: string } }>(
        '/teams/me',
        payload
      )
      return response.data.data
    },
    onSuccess: (data) => {
      const user = useAuthStore.getState().user
      if (user) {
        setUser({
          ...user,
          team: { ...user.team, name: data.name } as any
        })
      }
    },
    // Errors are shown inline by the create-team step (no duplicate toast).
  })

  // 3. Invite members
  const inviteMembersMutation = useMutation({
    mutationFn: async (payload: InviteMembersPayload) => {
      const response = await api.post<{ data: any }>('/teams/me/invite', payload)
      return response.data.data
    },
    // The invite step renders a per-email result list and inline errors, which is
    // accurate even when some addresses fail — a blanket toast was not.
  })

  // 4. Complete onboarding (Patch auth/me with onboardingCompleted: true)
  const completeOnboardingMutation = useMutation({
    mutationFn: async () => {
      const response = await api.patch<{ data: { user: any } }>('/auth/me', {
        onboardingCompleted: true
      })
      return response.data.data
    },
    onSuccess: (data) => {
      // Update local store — invalidate only after full completion to avoid mid-flow refetch
      const user = useAuthStore.getState().user
      if (user) {
        setUser({
          ...user,
          onboardingCompleted: true
        })
      }
      // Invalidate only on final completion (not mid-flow steps)
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
    },
    // The completion screen shows the error with a retry action.
  })

  return {
    checkSlug: checkSlugMutation.mutateAsync,
    isCheckingSlug: checkSlugMutation.isPending,
    createTeam: createTeamMutation.mutateAsync,
    isCreatingTeam: createTeamMutation.isPending,
    updateTeam: updateTeamMutation.mutateAsync,
    isUpdatingTeam: updateTeamMutation.isPending,
    inviteMembers: inviteMembersMutation.mutateAsync,
    isInviting: inviteMembersMutation.isPending,
    completeOnboarding: completeOnboardingMutation.mutateAsync,
    isCompleting: completeOnboardingMutation.isPending
  }
}
