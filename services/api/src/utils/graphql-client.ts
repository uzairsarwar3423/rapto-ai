import { IntegrationError } from './errors'

export class GraphQLClientError extends Error {
    constructor(
        public readonly errors: any[],
        message: string
    ) {
        super(message)
        this.name = 'GraphQLClientError'
    }
}

interface GraphQLRequestOptions {
    endpoint: string
    headers: Record<string, string>
    query: string
    variables?: Record<string, unknown>
    timeoutMs?: number
    providerName?: string
}

/**
 * A minimal, generic GraphQL client wrapper.
 * Design rule (Day 61): This file knows NOTHING about Linear or Vocaply domain logic.
 * It exists solely to encapsulate the "GraphQL Error Triad" handling.
 */
export async function graphqlRequest<T = any>({
    endpoint,
    headers,
    query,
    variables,
    timeoutMs = 15000,
    providerName = 'GRAPHQL_PROVIDER',
}: GraphQLRequestOptions): Promise<T> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...headers,
            },
            body: JSON.stringify({ query, variables }),
            signal: controller.signal,
        })

        // Category 1: Transport-level failure (HTTP non-2xx)
        if (!response.ok) {
            throw new IntegrationError(
                providerName,
                `HTTP error! status: ${response.status}`
            )
        }

        const body = await response.json() as any

        // Category 2: GraphQL-level error (HTTP 200, errors[] array present)
        if (body.errors && Array.isArray(body.errors) && body.errors.length > 0) {
            throw new GraphQLClientError(
                body.errors,
                `GraphQL errors returned from ${providerName}`
            )
        }

        // Category 4 (from plan): If neither of above and data is missing entirely
        if (body.data === undefined) {
            throw new IntegrationError(
                providerName,
                `Malformed response: no data field present in GraphQL response`
            )
        }

        return body.data as T
    } catch (error: any) {
        if (error.name === 'AbortError') {
            throw new IntegrationError(providerName, `Request timed out after ${timeoutMs}ms`)
        }
        if (error instanceof IntegrationError || error instanceof GraphQLClientError) {
            throw error
        }
        throw new IntegrationError(providerName, `Network or parsing error: ${error.message}`)
    } finally {
        clearTimeout(timeoutId)
    }
}
