import { supabase } from "./supabase"

export type NamePreference = "display_name" | "full_name"

export type UserSettings = {
    reactToUnauthorized: boolean
    autoSub: boolean
    namePreference: NamePreference
}

const DEFAULT_SETTINGS: UserSettings = {
    reactToUnauthorized: true,
    autoSub: true,
    namePreference: "display_name",
}

export function isSettingsTableMissing(error: unknown): boolean {
    return typeof error === "object" && error !== null && "code" in error && error.code === "PGRST205"
}

export async function getUserSettings(teamId: string, userId: string): Promise<UserSettings> {
    const { data, error } = await supabase
        .from("user_settings")
        .select("react_to_unauthorized, auto_sub, name_preference")
        .eq("team_id", teamId)
        .eq("user_id", userId)
        .maybeSingle()

    if (error) throw error
    if (!data) return DEFAULT_SETTINGS

    return {
        reactToUnauthorized: data.react_to_unauthorized,
        autoSub: data.auto_sub,
        namePreference: data.name_preference,
    }
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

export async function setAutoSub(teamId: string, userId: string, enabled: boolean): Promise<void> {
    const { error } = await supabase.from("user_settings").upsert(
        {
            team_id: teamId,
            user_id: userId,
            auto_sub: enabled,
            updated_at: new Date().toISOString(),
        },
        { onConflict: "team_id,user_id" },
    )
    if (error) throw error
}

export async function setNamePreference(
    teamId: string,
    userId: string,
    preference: NamePreference,
): Promise<void> {
    const { error } = await supabase.from("user_settings").upsert(
        {
            team_id: teamId,
            user_id: userId,
            name_preference: preference,
            updated_at: new Date().toISOString(),
        },
        { onConflict: "team_id,user_id" },
    )
    if (error) throw error
}
