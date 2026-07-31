import { OtterPocketBase } from "./pocketbase";

/**
 * Tells whether PocketBase refused the call because the client lost its superuser rights.
 */
function isSuperuserError(error: unknown): boolean {
    if (!error || typeof error !== "object" || !("status" in error) || error.status !== 403) {
        return false;
    }

    const err = error as { message?: unknown; response?: { message?: unknown } };
    const responseMessage = typeof err.response?.message === "string" ? err.response.message : "";
    const directMessage = typeof err.message === "string" ? err.message : "";
    return `${responseMessage} ${directMessage}`.toLowerCase().includes("only superusers can perform this action");
}

/**
 * Runs a PocketBase operation, re-authenticating as superuser once if it was rejected
 * for missing rights. Any other error is rethrown untouched.
 */
export async function withSuperuserRetry<T>(operation: () => Promise<T>): Promise<T> {
    try {
        return await operation();
    } catch (error) {
        if (!isSuperuserError(error)) throw error;

        const email = process.env.PB_EMAIL;
        const password = process.env.PB_PASSWORD;
        if (!email || !password) throw error;

        const pb = await OtterPocketBase.getClient();
        await pb.collection("_superusers").authWithPassword(email, password);
        return operation();
    }
}
