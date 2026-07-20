"use client";

import React, { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { useTeam } from '../hooks/useTeam';
import { useUpdateTeam } from '../hooks/useUpdateTeam';
import { TeamSlugField } from './TeamSlugField';
import { useSaveState } from '@/shared/hooks/useSaveState';
import { SaveStateIndicator } from '@/shared/components/feedback/SaveStateIndicator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, ShieldAlert, Loader2 } from 'lucide-react';

const COMMON_TIMEZONES = [
  { value: 'UTC', label: 'UTC (Universal Coordinated Time)' },
  { value: 'America/New_York', label: 'America/New_York (Eastern Time)' },
  { value: 'America/Chicago', label: 'America/Chicago (Central Time)' },
  { value: 'America/Denver', label: 'America/Denver (Mountain Time)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (Pacific Time)' },
  { value: 'Europe/London', label: 'Europe/London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Europe/Paris (CET/CEST)' },
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (IST)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (JST)' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney (AEST/AEDT)' },
];

const teamSettingsSchema = z.object({
  name: z.string().min(2, 'Team name must be at least 2 characters').max(100, 'Team name must be less than 100 characters'),
  defaultTimezone: z.string(),
  weeklyDigestEnabled: z.boolean(),
  weeklyDigestDay: z.string(),
  allowMembersToInvite: z.boolean(),
  customBotName: z.string().max(50, 'Bot name must be less than 50 characters').optional(),
});

type TeamSettingsFormData = z.infer<typeof teamSettingsSchema>;

export function TeamSettingsForm() {
  const user = useAuthStore((state) => state.user);
  const { data: team, isLoading: isTeamLoading } = useTeam();
  const updateTeamMutation = useUpdateTeam();
  const { state: saveState, run } = useSaveState();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Check if current user is admin/owner
  const isAuthorized = user?.role === 'ADMIN' || (user?.role as string) === 'OWNER';

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
    reset,
  } = useForm<TeamSettingsFormData>({
    resolver: zodResolver(teamSettingsSchema),
    defaultValues: {
      name: '',
      defaultTimezone: 'UTC',
      weeklyDigestEnabled: true,
      weeklyDigestDay: 'MONDAY',
      allowMembersToInvite: false,
      customBotName: '',
    },
  });

  const weeklyDigestEnabled = watch('weeklyDigestEnabled');

  useEffect(() => {
    if (team) {
      reset({
        name: team.name || '',
        defaultTimezone: team.settings?.defaultTimezone || 'UTC',
        weeklyDigestEnabled: team.settings?.weeklyDigestEnabled !== false,
        weeklyDigestDay: team.settings?.weeklyDigestDay || 'MONDAY',
        allowMembersToInvite: !!team.settings?.allowMembersToInvite,
        customBotName: team.settings?.customBotName || '',
      });
    }
  }, [team, reset]);

  const onSubmit = (data: TeamSettingsFormData) => {
    if (!isAuthorized) return;
    setErrorMessage(null);

    run(async () => {
      await updateTeamMutation.mutateAsync({
        name: data.name,
        settings: {
          defaultTimezone: data.defaultTimezone,
          weeklyDigestEnabled: data.weeklyDigestEnabled,
          weeklyDigestDay: data.weeklyDigestDay,
          allowMembersToInvite: data.allowMembersToInvite,
          customBotName: data.customBotName,
        },
      });
    }).catch((err: any) => {
      const msg = err.response?.data?.error?.message || 'Failed to update team settings.';
      setErrorMessage(msg);
    });
  };

  if (isTeamLoading) {
    return (
      <div className="py-8 flex items-center justify-center text-muted-foreground text-xs gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading team settings...
      </div>
    );
  }

  return (
    <div className="max-w-md space-y-6">
      {/* Authorization Banner */}
      {!isAuthorized && (
        <div className="flex gap-3 rounded-xl p-4 text-xs bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-500" role="alert">
          <ShieldAlert className="h-4.5 w-4.5 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-semibold">View-only mode</p>
            <p className="text-muted-foreground">Only team administrators and owners can update team settings.</p>
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="flex gap-3 rounded-xl p-4 text-sm bg-error-subtle/30 border border-error/20 text-error" role="alert">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="font-medium">{errorMessage}</p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        {/* Team Name */}
        <div className="space-y-1.5">
          <label htmlFor="team-name" className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Team name
          </label>
          <input
            id="team-name"
            type="text"
            disabled={!isAuthorized}
            {...register('name')}
            aria-describedby={errors.name ? 'team-name-error' : undefined}
            className={`w-full rounded-xl border bg-background px-4 py-2.5 text-sm text-foreground shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand disabled:opacity-60 disabled:cursor-not-allowed ${
              errors.name ? 'border-error' : 'border-border'
            }`}
            placeholder="Acme Corp"
          />
          {errors.name && (
            <p id="team-name-error" className="text-xs text-error font-medium flex items-center gap-1 mt-1">
              <AlertCircle className="h-3 w-3" /> {errors.name.message}
            </p>
          )}
        </div>

        {/* Read-Only Team Slug Field */}
        {team && <TeamSlugField slug={team.slug} />}

        {/* Bot Customization */}
        <div className="space-y-1.5 pt-2 border-t border-border">
          <div className="flex items-center justify-between">
            <label htmlFor="custom-bot-name" className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Bot Customization
            </label>
            {team?.plan === 'FREE' && (
              <span className="inline-flex items-center rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-medium text-brand">
                Upgrade to Pro
              </span>
            )}
          </div>
          <input
            id="custom-bot-name"
            type="text"
            disabled={!isAuthorized || team?.plan === 'FREE'}
            {...register('customBotName')}
            className={`w-full rounded-xl border bg-background px-4 py-2.5 text-sm text-foreground shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand disabled:opacity-60 disabled:cursor-not-allowed ${
              errors.customBotName ? 'border-error' : 'border-border'
            }`}
            placeholder={team?.plan === 'FREE' ? "Available on premium plans" : "e.g. Acme Corp Assistant"}
          />
          {errors.customBotName ? (
            <p className="text-xs text-error font-medium flex items-center gap-1 mt-1">
              <AlertCircle className="h-3 w-3" /> {errors.customBotName.message}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground leading-normal mt-1">
              Customize the name of the AI bot that joins your meetings. This feature is available on premium plans.
            </p>
          )}
        </div>

        {/* Default Team Timezone */}
        <div className="space-y-1.5">
          <label htmlFor="team-timezone" className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Default Team Timezone
          </label>
          <div>
            <Controller
              control={control}
              name="defaultTimezone"
              render={({ field }) => (
                <Select disabled={!isAuthorized} value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="team-timezone" className="w-full h-[42px] px-4 rounded-xl border-border focus:ring-2 focus:border-brand focus:ring-brand">
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMON_TIMEZONES.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>
                        {tz.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <p className="text-[11px] text-muted-foreground leading-normal">
            The fallback timezone applied to new team members and shared dashboard calendars.
          </p>
        </div>

        {/* Weekly Digest Toggle */}
        <div className="space-y-3 pt-2">
          <span className="text-xs font-semibold text-foreground uppercase tracking-wider block">
            Notifications & Digest Settings
          </span>
          
          <div className="flex items-start gap-3">
            <input
              id="weekly-digest-toggle"
              type="checkbox"
              disabled={!isAuthorized}
              {...register('weeklyDigestEnabled')}
              className="mt-1 h-4 w-4 rounded border-border text-brand focus:ring-brand accent-brand cursor-pointer disabled:cursor-not-allowed"
            />
            <div className="space-y-0.5">
              <label htmlFor="weekly-digest-toggle" className="text-sm font-medium text-foreground cursor-pointer select-none">
                Enable Weekly Commitment Digest
              </label>
              <p className="text-[11px] text-muted-foreground leading-normal">
                Email team members a summary of their fulfilled, pending, and missed commitments weekly.
              </p>
            </div>
          </div>

          {weeklyDigestEnabled && (
            <div className="pl-7 space-y-1.5 animate-in fade-in-0 slide-in-from-top-2 duration-120">
              <label htmlFor="digest-day" className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Send Digest On
              </label>
              <div>
                <Controller
                  control={control}
                  name="weeklyDigestDay"
                  render={({ field }) => (
                    <Select disabled={!isAuthorized} value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="digest-day" className="w-full sm:w-48 h-[42px] px-4 rounded-xl border-border focus:ring-2 focus:border-brand focus:ring-brand">
                        <SelectValue placeholder="Select day" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MONDAY">Monday</SelectItem>
                        <SelectItem value="TUESDAY">Tuesday</SelectItem>
                        <SelectItem value="WEDNESDAY">Wednesday</SelectItem>
                        <SelectItem value="THURSDAY">Thursday</SelectItem>
                        <SelectItem value="FRIDAY">Friday</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>
          )}
        </div>

        {/* Team Invitations Privileges */}
        <div className="flex items-start gap-3 pt-2 border-t border-border">
          <input
            id="allow-invites-toggle"
            type="checkbox"
            disabled={!isAuthorized}
            {...register('allowMembersToInvite')}
            className="mt-1 h-4 w-4 rounded border-border text-brand focus:ring-brand accent-brand cursor-pointer disabled:cursor-not-allowed"
          />
          <div className="space-y-0.5">
            <label htmlFor="allow-invites-toggle" className="text-sm font-medium text-foreground cursor-pointer select-none">
              Allow members to invite teammates
            </label>
            <p className="text-[11px] text-muted-foreground leading-normal">
              When checked, standard members can send invitations. When unchecked, only administrators can invite.
            </p>
          </div>
        </div>

        {isAuthorized && (
          <div className="border-t border-border pt-4 flex items-center gap-3">
            <button
              type="submit"
              disabled={saveState === 'saving'}
              className="flex items-center justify-center rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-brand transition-all hover:bg-brand-mid focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 disabled:bg-muted-subtle disabled:shadow-none disabled:cursor-not-allowed cursor-pointer"
            >
              Save team settings
            </button>
            
            <SaveStateIndicator state={saveState} />
          </div>
        )}
      </form>
    </div>
  );
}
