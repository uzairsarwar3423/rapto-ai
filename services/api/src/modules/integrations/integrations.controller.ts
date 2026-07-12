import { Request, Response, NextFunction } from 'express'
import { integrationsService } from './integrations.service'
import { ProviderType } from './integrations.types'
import { env } from '../../config/env'
import { redis } from '../../config/redis'
import { logger } from '../../config/logger'

// ─────────────────────────────────────────────────────────────────────────────
// JIRA-SPECIFIC CONTROLLERS (Day 58 §13)
// Rule: zero business logic here — handlers are pure request/response adapters.
// All orchestration lives in integrations.service.ts.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/integrations/jira/connect
 * Role: ADMIN+. Redirects to Atlassian's OAuth consent screen.
 */
export const connectJiraController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const teamId = req.teamId!
        const userId = req.user!.id
        const result = await integrationsService.initiateOAuth('JIRA', teamId, userId)
        // Return auth URL for frontend to redirect — do not redirect server-side
        // (frontend needs to open the OAuth flow in the same tab/window)
        res.status(200).json({ success: true, data: { authUrl: result.authUrl } })
    } catch (e) {
        next(e)
    }
}

/**
 * GET /api/v1/integrations/jira/callback
 * No requireAuth — secured by the Redis state token (§13).
 * The user's session may have aged during the OAuth round-trip, so JWT auth
 * is intentionally absent; the state token is the security boundary.
 */
export const jiraCallbackController = async (req: Request, res: Response, next: NextFunction) => {
    const frontendUrl = env.FRONTEND_URL || 'http://localhost:3000'
    try {
        const { code, state, error } = req.query

        if (error) {
            logger.info({ error }, 'integrate.jira.callback_failed: user denied consent or provider error')
            return res.redirect(`${frontendUrl}/settings/integrations?error=oauth_denied`)
        }

        if (!code || !state) {
            return res.redirect(`${frontendUrl}/settings/integrations?error=oauth_invalid_params`)
        }

        const result = await integrationsService.handleOAuthCallback('JIRA', code as string, state as string)
        res.redirect(result.redirectUrl)
    } catch (e: any) {
        const errorCode = e.code || 'JIRA_CONNECT_FAILED'
        logger.error({ err: e.message, code: errorCode }, 'integrate.jira.callback_failed')
        res.redirect(`${frontendUrl}/settings/integrations?error=${encodeURIComponent(errorCode)}`)
    }
}

/**
 * GET /api/v1/integrations/jira/projects
 * Role: ADMIN+. Returns simplified project list for the settings dropdown.
 * 422 if integration exists but cloudId is missing (structurally impossible
 * per §9's design, but defended anyway per §24).
 */
export const listJiraProjectsController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const teamId = req.teamId!
        const projects = await integrationsService.getJiraProjects(teamId)
        res.status(200).json({ success: true, data: { projects } })
    } catch (e) {
        next(e)
    }
}

/**
 * PATCH /api/v1/integrations/jira/configure
 * Role: ADMIN+. Sets projectKey, defaultIssueType, optional defaultPriority.
 * Uses JSONB merge-update — setting only projectKey never clobbers defaultIssueType.
 */
export const configureJiraController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const teamId = req.teamId!
        const { projectKey, defaultIssueType, defaultPriority } = req.body

        const configPatch: Record<string, string> = { projectKey, defaultIssueType }
        if (defaultPriority) configPatch.defaultPriority = defaultPriority

        const result = await integrationsService.updateConfig(teamId, 'JIRA', configPatch)
        res.status(200).json({ success: true, data: result })
    } catch (e) {
        next(e)
    }
}

/**
 * DELETE /api/v1/integrations/jira
 * Role: ADMIN+. Revokes token, deletes the row.
 * Already-synced action items KEEP their jiraIssueId/Url/SyncedAt (historical record).
 */
export const disconnectJiraController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const teamId = req.teamId!
        const userId = req.user!.id
        await integrationsService.disconnectIntegration(teamId, 'JIRA', userId)
        res.status(200).json({ success: true, data: { message: 'Jira disconnected successfully' } })
    } catch (e) {
        next(e)
    }
}


export const listIntegrationsController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const teamId = req.teamId!
        const userId = req.user!.id
        const list = await integrationsService.listIntegrations(teamId)
        
        // Fetch user calendar integrations
        const { prisma } = await import('../../db/client')
        const userIntegrations = await prisma.userIntegration.findMany({
            where: { userId },
            select: {
                provider: true,
                syncEnabled: true,
                lastSyncedAt: true,
                consecutiveErrors: true,
                calendarId: true,
            }
        })
        
        res.status(200).json({
            teamIntegrations: list,
            userIntegrations: userIntegrations.map(u => ({
                provider: u.provider,
                isActive: u.syncEnabled, // map syncEnabled to isActive for visual consistency
                syncEnabled: u.syncEnabled,
                lastSyncedAt: u.lastSyncedAt,
                consecutiveErrors: u.consecutiveErrors,
                calendarId: u.calendarId,
            }))
        })
    } catch (e) {
        next(e)
    }
}

export const connectController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const teamId = req.teamId!
        const userId = req.user!.id
        const provider = req.params.provider as ProviderType
        
        const result = await integrationsService.initiateOAuth(provider, teamId, userId)
        res.status(200).json(result)
    } catch (e) {
        next(e)
    }
}

export const callbackController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const provider = req.params.provider as ProviderType
        const { code, state, error } = req.query

        if (error) {
            // User denied consent or provider error
            return res.redirect(`${env.FRONTEND_URL}/settings/integrations?error=${error}`)
        }

        const result = await integrationsService.handleOAuthCallback(provider, code as string, state as string)
        res.redirect(result.redirectUrl)
    } catch (e: any) {
        let errorCode = 'UNKNOWN_ERROR'
        if (e.code === 'OAUTH_INVALID_STATE') errorCode = 'OAUTH_INVALID_STATE'
        if (e.code === 'OAUTH_PROVIDER_MISMATCH') errorCode = 'OAUTH_PROVIDER_MISMATCH'
        if (e.code === 'PROVIDER_TOKEN_EXCHANGE_FAILED') errorCode = 'PROVIDER_TOKEN_EXCHANGE_FAILED'
        
        res.redirect(`${env.FRONTEND_URL}/settings/integrations?error=${errorCode}`)
    }
}

export const disconnectController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const teamId = req.teamId!
        const userId = req.user!.id
        const provider = req.params.provider as ProviderType

        const result = await integrationsService.disconnectIntegration(teamId, provider, userId)
        res.status(200).json(result)
    } catch (e) {
        next(e)
    }
}

export const testConnectionController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const teamId = req.teamId!
        const provider = req.params.provider as ProviderType

        const result = await integrationsService.testConnection(teamId, provider)
        res.status(200).json(result)
    } catch (e) {
        next(e)
    }
}

export const updateConfigController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const teamId = req.teamId!
        const provider = req.params.provider as ProviderType
        const { config } = req.body

        const result = await integrationsService.updateConfig(teamId, provider, config)
        res.status(200).json(result)
    } catch (e) {
        next(e)
    }
}

export const getProviderOptionsController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const teamId = req.teamId!
        const provider = req.params.provider as ProviderType

        const result = await integrationsService.getProviderOptions(teamId, provider)
        res.status(200).json(result)
    } catch (e) {
        next(e)
    }
}

export const testCalendarConnectionController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.id
        const provider = req.params.provider as 'GOOGLE_CALENDAR' | 'OUTLOOK_CALENDAR'

        const result = await integrationsService.testCalendarConnection(userId, provider)
        res.status(200).json(result)
    } catch (e) {
        next(e)
    }
}

export const disconnectCalendarController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.id
        const provider = req.params.provider as 'GOOGLE_CALENDAR' | 'OUTLOOK_CALENDAR'

        const result = await integrationsService.disconnectCalendar(userId, provider)
        res.status(200).json(result)
    } catch (e) {
        next(e)
    }
}

export const updateCalendarConfigController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.id
        const provider = req.params.provider as 'GOOGLE_CALENDAR' | 'OUTLOOK_CALENDAR'
        const { config } = req.body

        const result = await integrationsService.updateCalendarConfig(userId, provider, config)
        res.status(200).json(result)
    } catch (e) {
        next(e)
    }
}

export const getCalendarPreviewController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.id

        const result = await integrationsService.getCalendarPreview(userId)
        res.status(200).json(result)
    } catch (e) {
        next(e)
    }
}

export const syncNowController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.id
        const { syncUserCalendar } = await import('../../services/calendar-sync.service')

        const result = await syncUserCalendar(userId)
        res.status(200).json({ success: true, data: result })
    } catch (e) {
        next(e)
    }
}

export const connectGoogleCalendarController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.id
        const context = req.query.context === 'onboarding' ? 'onboarding' : 'settings'
        
        const crypto = await import('crypto')
        const state = crypto.randomBytes(32).toString('hex')
        
        const redisValue = JSON.stringify({ userId, context })
        await redis.set(`oauth:state:calendar:${state}`, redisValue, 'EX', 600)
        
        const { oauthProvidersConfig } = await import('../../config/oauth-providers.config')
        const config = oauthProvidersConfig.GOOGLE_CALENDAR
        
        const params = new URLSearchParams({
            client_id: config.clientId,
            redirect_uri: config.redirectUri,
            response_type: 'code',
            scope: config.scopes.join(' '),
            state,
            access_type: 'offline',
            prompt: 'consent',
        })
        
        const authUrl = `${config.authUrl}?${params.toString()}`
        res.redirect(authUrl)
    } catch (e) {
        next(e)
    }
}

export const googleCalendarCallbackController = async (req: Request, res: Response, next: NextFunction) => {
    const frontendUrl = env.FRONTEND_URL || 'http://localhost:3000'
    try {
        const code = req.query.code as string
        const state = req.query.state as string
        const error = req.query.error as string
        
        if (error === 'access_denied') {
            return res.redirect(`${frontendUrl}/settings/integrations?error=oauth_denied`)
        }
        
        if (!state || !code) {
            return res.redirect(`${frontendUrl}/settings/integrations?error=oauth_invalid_state`)
        }
        
        const stored = await redis.get(`oauth:state:calendar:${state}`)
        if (!stored) {
            return res.redirect(`${frontendUrl}/settings/integrations?error=oauth_invalid_state`)
        }
        await redis.del(`oauth:state:calendar:${state}`)
        
        let userId = ''
        let context = 'settings'
        try {
            const parsed = JSON.parse(stored)
            userId = parsed.userId
            context = parsed.context || 'settings'
        } catch (_) {
            userId = stored
        }
        
        await integrationsService.completeGoogleCalendarConnect(userId, code)
        
        const redirectUrl = context === 'onboarding'
            ? `${frontendUrl}/onboarding/connect-calendar?connected=true`
            : `${frontendUrl}/settings/integrations?connected=GOOGLE_CALENDAR`
            
        res.redirect(redirectUrl)
    } catch (e: any) {
        logger.error({ err: e.message }, 'Google Calendar OAuth callback failed')
        res.redirect(`${frontendUrl}/settings/integrations?error=oauth_failed`)
    }
}
