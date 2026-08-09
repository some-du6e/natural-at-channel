import * as Sentry from "@sentry/bun";

const USER_ERROR_MESSAGE = "Something went wrong, dm karim if this keeps happening. it should already be in sentry though"

export function errorMessage(e: unknown): string {
    return e instanceof Error ? e.message : String(e)
}

export function handleError(e: unknown) {
    if (e instanceof Error) {
        console.error(e)
        Sentry.captureException(e)
        return { ok: false, error: USER_ERROR_MESSAGE }
    } else {
        console.error("Unknown error:", e)
        Sentry.captureMessage(`Unknown error: ${e}`)
        return { ok: false, error: USER_ERROR_MESSAGE }
    }
}
