"use client";

import React, { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useRevokeSession } from '../hooks/useRevokeSession';
import { Trash2, Loader2 } from 'lucide-react';

interface RevokeSessionButtonProps {
  sessionId: string;
}

export function RevokeSessionButton({ sessionId }: RevokeSessionButtonProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const revokeMutation = useRevokeSession();

  const handleRevoke = async () => {
    try {
      await revokeMutation.mutateAsync(sessionId);
      setConfirmOpen(false);
    } catch (e) {
      // Handled silently
    }
  };

  return (
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-error hover:text-error hover:bg-error/10 h-8 font-semibold cursor-pointer rounded-lg px-2.5 flex items-center gap-1.5"
          aria-label="Revoke session"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Revoke
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-heading font-semibold text-base text-foreground">
            Revoke this session?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-xs text-muted-foreground">
            This device will be signed out of your account immediately and must log back in to access the system.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-xl h-9 text-xs">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleRevoke}
            disabled={revokeMutation.isPending}
            className="bg-[--danger] hover:bg-[--danger]/90 text-white rounded-xl h-9 text-xs flex items-center gap-1"
          >
            {revokeMutation.isPending ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" /> Revoking...
              </>
            ) : (
              'Revoke session'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
