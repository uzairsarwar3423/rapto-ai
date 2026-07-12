import { TeamProvider } from '@prisma/client'
import { IntegrationProvider } from './provider.interface'
import { AppError } from '../../../utils/errors'
import { jiraProvider } from './jira.provider'
import { slackProvider } from './slack.provider'
import { linearProvider } from './linear.provider'
import { notionProvider } from './notion.provider'

/**
 * provider.registry.ts — The SINGLE lookup point for all outbound integration providers.
 *
 * DESIGN RULE (Day 58 Principle 2): integrations.service.ts and integrate.worker.ts
 * import ONLY this module — never a concrete provider. This is the literal, mechanical
 * test for whether the abstraction is doing its job.
 *
 * Adding a new provider on Days 61/62 means:
 *   1. Implement IntegrationProvider in a new file
 *   2. Add one line to this registry
 *   — Zero changes to service or worker layers, confirmed as Day 58's acceptance criterion.
 *
 * Registry state:
 *   JIRA:   ✅ IMPLEMENTED (Day 58)
 *   SLACK:  ✅ IMPLEMENTED (Day 60)
 *   LINEAR: ✅ IMPLEMENTED (Day 61)
 *   NOTION: ✅ IMPLEMENTED (Day 62)
 */
const REGISTRY: Partial<Record<TeamProvider, IntegrationProvider>> = {
    JIRA: jiraProvider,
    SLACK: slackProvider,
    LINEAR: linearProvider,
    NOTION: notionProvider,
}

/**
 * getProvider — look up a provider implementation by name.
 *
 * @throws AppError('PROVIDER_NOT_SUPPORTED', 501) for unimplemented providers.
 *   WHY 501, not 404 or 422:
 *   501 Not Implemented is semantically correct for "recognized concept not yet supported"
 *   — distinct from 404 (resource doesn't exist) or 422 (your request is malformed).
 *   A team attempting to sync to an unimplemented provider sees "coming, not broken."
 */
export function getProvider(name: TeamProvider): IntegrationProvider {
    const provider = REGISTRY[name]
    if (!provider) {
        throw new AppError(
            'PROVIDER_NOT_SUPPORTED',
            501,
            `Provider '${name}' is not yet implemented. It is a recognized, planned provider — check back in a future release.`
        )
    }
    return provider
}

/**
 * isProviderSupported — non-throwing existence check.
 * Used by the service layer to validate provider params before lookup.
 */
export function isProviderSupported(name: TeamProvider): boolean {
    return name in REGISTRY && REGISTRY[name] !== undefined
}
