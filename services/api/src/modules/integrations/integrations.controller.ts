import { Request, Response, NextFunction } from 'express'
import { integrationsService } from './integrations.service'
import { ProviderType } from './integrations.types'
import { env } from '../../config/env'

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

