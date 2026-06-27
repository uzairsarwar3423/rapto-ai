"use client";

import React, { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuthStore } from '../store/auth.store';
import { useUpdateProfile } from '../hooks/useUpdateProfile';
import { useSaveState } from '@/shared/hooks/useSaveState';
import { SaveStateIndicator } from '@/shared/components/feedback/SaveStateIndicator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AlertCircle, Camera, Check } from 'lucide-react';

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

const PRESET_AVATARS = [
  'https://api.dicebear.com/7.x/lorelei/svg?seed=Uzair',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
  'https://api.dicebear.com/7.x/bottts/svg?seed=Aneka',
  'https://api.dicebear.com/7.x/adventurer/svg?seed=Jack',
  'https://api.dicebear.com/7.x/big-ears/svg?seed=Bob',
  'https://api.dicebear.com/7.x/fun-emoji/svg?seed=Cody',
  'https://api.dicebear.com/7.x/lorelei/svg?seed=Nala',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Zoe',
  'https://api.dicebear.com/7.x/bottts/svg?seed=Buster',
  'https://api.dicebear.com/7.x/adventurer/svg?seed=Cleo',
  'https://api.dicebear.com/7.x/miniavs/svg?seed=Milo',
  'https://api.dicebear.com/7.x/fun-emoji/svg?seed=Ziggy',
];

const profileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name must be less than 100 characters'),
  timezone: z.string().min(1, 'Timezone is required'),
});

type ProfileFormData = z.infer<typeof profileSchema>;

export function ProfileForm() {
  const user = useAuthStore((state) => state.user);
  const updateProfileMutation = useUpdateProfile();
  const { state: saveState, run } = useSaveState();
  
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(user?.avatarUrl || null);
  const [showAvatarGrid, setShowAvatarGrid] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Read language locale from local storage or default to 'en'
  const [language, setLanguage] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('vocaply_locale') || 'en';
    }
    return 'en';
  });

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user?.name || '',
      timezone: user?.timezone || 'UTC',
    },
  });

  const onSubmit = (data: ProfileFormData) => {
    setErrorMessage(null);
    run(async () => {
      // Save language locale to localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem('vocaply_locale', language);
      }
      
      await updateProfileMutation.mutateAsync({
        name: data.name,
        timezone: data.timezone,
        avatarUrl: selectedAvatar,
      });
    }).catch((err: any) => {
      const msg = err.response?.data?.error?.message || 'Failed to save changes. Please try again.';
      setErrorMessage(msg);
    });
  };

  const nameInitials = (user?.name || 'U')
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="max-w-md space-y-6">
      {errorMessage && (
        <div className="flex gap-3 rounded-xl p-4 text-sm bg-error-subtle/30 border border-error/20 text-error" role="alert">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="font-medium">{errorMessage}</p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        {/* Avatar Upload Field */}
        <div className="space-y-2">
          <span className="text-xs font-semibold text-foreground uppercase tracking-wider block">
            Profile avatar
          </span>
          <div className="flex items-center gap-4">
            <div className="relative group">
              <Avatar className="h-16 w-16 border-2 border-border shadow-inner">
                {selectedAvatar && <AvatarImage src={selectedAvatar} alt="Profile avatar" />}
                <AvatarFallback className="bg-brand-subtle text-brand font-heading text-lg font-bold">
                  {nameInitials}
                </AvatarFallback>
              </Avatar>
              <button
                type="button"
                onClick={() => setShowAvatarGrid(!showAvatarGrid)}
                className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-white cursor-pointer"
                aria-label="Change avatar"
              >
                <Camera className="h-5 w-5" />
              </button>
            </div>
            
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setShowAvatarGrid(!showAvatarGrid)}
                className="text-xs font-semibold text-brand hover:underline cursor-pointer"
              >
                Choose Illustration Avatar
              </button>
              <p className="text-[11px] text-muted-foreground leading-normal">
                Select from our premade avatars to represent yourself across the team.
              </p>
            </div>
          </div>

          {showAvatarGrid && (
            <div className="mt-3 p-3 bg-surface-2 rounded-xl border border-border space-y-2 animate-in fade-in-0 duration-120">
              <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">Select avatar</div>
              <div className="grid grid-cols-6 gap-2">
                {PRESET_AVATARS.map((url) => {
                  const isSelected = selectedAvatar === url;
                  return (
                    <button
                      key={url}
                      type="button"
                      onClick={() => {
                        setSelectedAvatar(url);
                        setShowAvatarGrid(false);
                      }}
                      className={`relative rounded-full overflow-hidden border p-0.5 transition-all cursor-pointer ${
                        isSelected ? 'border-brand scale-105 ring-2 ring-brand-light' : 'border-border hover:border-muted'
                      }`}
                    >
                      <img src={url} alt="Avatar option" className="h-10 w-10 rounded-full" />
                      {isSelected && (
                        <div className="absolute inset-0 bg-brand/20 flex items-center justify-center rounded-full text-white">
                          <Check className="h-4 w-4 bg-brand rounded-full p-0.5" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Full Name */}
        <div className="space-y-1.5">
          <label htmlFor="profile-name" className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Full name
          </label>
          <input
            id="profile-name"
            type="text"
            {...register('name')}
            aria-describedby={errors.name ? 'name-error' : undefined}
            className={`w-full rounded-xl border bg-background px-4 py-2.5 text-sm text-foreground shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand ${
              errors.name ? 'border-error' : 'border-border'
            }`}
            placeholder="John Doe"
          />
          {errors.name && (
            <p id="name-error" className="text-xs text-error font-medium flex items-center gap-1 mt-1">
              <AlertCircle className="h-3 w-3" /> {errors.name.message}
            </p>
          )}
        </div>

        {/* Timezone */}
        <div className="space-y-1.5">
          <label htmlFor="profile-timezone" className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Timezone
          </label>
          <div>
            <Controller
              control={control}
              name="timezone"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="profile-timezone" className="w-full h-[42px] px-4 rounded-xl border-border focus:ring-2 focus:border-brand focus:ring-brand">
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
            Used to calculate exact meeting timing, reminders, and daily digest schedules.
          </p>
        </div>

        {/* Language Locale */}
        <div className="space-y-1.5">
          <label htmlFor="profile-language" className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Language / Locale
          </label>
          <div>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger id="profile-language" className="w-full h-[42px] px-4 rounded-xl border-border focus:ring-2 focus:border-brand focus:ring-brand">
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English (US)</SelectItem>
                <SelectItem value="es">Español (ES)</SelectItem>
                <SelectItem value="fr">Français (FR)</SelectItem>
                <SelectItem value="de">Deutsch (DE)</SelectItem>
                <SelectItem value="ja">日本語 (JP)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-[11px] text-muted-foreground leading-normal">
            Select your preferred display language for email updates and weekly commitment digests.
          </p>
        </div>

        <div className="border-t border-border pt-4 flex items-center gap-3">
          <button
            type="submit"
            disabled={saveState === 'saving'}
            className="flex items-center justify-center rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-brand transition-all hover:bg-brand-mid focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 disabled:bg-muted-subtle disabled:shadow-none disabled:cursor-not-allowed cursor-pointer"
          >
            Save changes
          </button>
          
          <SaveStateIndicator state={saveState} />
        </div>
      </form>
    </div>
  );
}
