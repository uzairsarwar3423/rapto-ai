/**
 * server-state.ts — Shared server readiness flag
 *
 * Breaks the circular import between app.ts and server.ts.
 *
 *   server.ts → sets serverReady = true after all DB connections succeed
 *   app.ts    → reads serverReady in /ready endpoint
 *
 * Neither file imports the other — both import this neutral module.
 */

let _ready = false

export function setServerReady(ready: boolean): void {
    _ready = ready
}

export function isServerReady(): boolean {
    return _ready
}
