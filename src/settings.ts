import { supabase } from "./supabase"

export type UserSettings = {
    reactToUnauthorized: boolean
}

const DEFAULT_SETTINGS: UserSettings = {
    reactToUnauthorized: true,
}

export function isSettingsTableMissing(error: unknown): boolean {
    return typeof error === "object" && error !== null && "code" in error && error.code === "PGRST205"
}

export async function getUserSettings(teamId: string, userId: string): Promise<UserSettings> {
    const { data, error } = await supabase
        .from("user_settings")
        .select("react_to_unauthorized")
        .eq("team_id", teamId)
        .eq("user_id", userId)
        .maybeSingle()

    if (error) throw error
    if (!data) return DEFAULT_SETTINGS

    return { reactToUnauthorized: data.react_to_unauthorized }
}

export async function setReactToUnauthorized(
    teamId: string,
    userId: string,
    enabled: boolean,
): Promise<void> {
    const { error } = await supabase.from("user_settings").upsert(
        {
            team_id: teamId,
            user_id: userId,
            react_to_unauthorized: enabled,
            updated_at: new Date().toISOString(),
        },
        { onConflict: "team_id,user_id" },
    )
    if (error) throw error
}
