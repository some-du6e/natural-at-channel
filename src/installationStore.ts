import type { Installation, InstallationStore, InstallURLOptions } from "@slack/bolt"
import { supabase } from "./supabase"

type Row = {
    team_id: string
    user_id: string
    user_token: string
    user_scopes: string[]
    installed_at: string
}

export class SupabaseInstallationStore implements InstallationStore {
    async storeInstallation(installation: Installation): Promise<void> {
        if (installation.isEnterpriseInstall) {
            throw new Error("Enterprise installs are not supported")
        }
        const teamId = installation.team?.id
        const userId = installation.user.id
        const userToken = installation.user.token
        if (!teamId || !userToken) {
            throw new Error("Installation is missing team.id or user.token")
        }
        const row: Row = {
            team_id: teamId,
            user_id: userId,
            user_token: userToken,
            user_scopes: installation.user.scopes ?? [],
            installed_at: new Date().toISOString(),
        }
        const { error } = await supabase
            .from("slack_installations")
            .upsert(row, { onConflict: "team_id,user_id" })
        if (error) throw error
    }

    async fetchInstallation(query: {
        teamId?: string
        enterpriseId?: string
        userId?: string
        conversationId?: string
        isEnterpriseInstall: boolean
    }): Promise<Installation> {
        if (query.isEnterpriseInstall) {
            throw new Error("Enterprise installs are not supported")
        }
        if (!query.teamId || !query.userId) {
            throw new Error("fetchInstallation requires teamId and userId")
        }
        const { data, error } = await supabase
            .from("slack_installations")
            .select("*")
            .eq("team_id", query.teamId)
            .eq("user_id", query.userId)
            .maybeSingle()
        if (error) throw error
        if (!data) throw new Error("Installation not found")

        const row = data as Row
        const installation = {
            team: { id: row.team_id },
            user: {
                id: row.user_id,
                token: row.user_token,
                scopes: row.user_scopes,
            },
            tokenType: "user",
            isEnterpriseInstall: false,
            appId: process.env.BSLACK_APP_ID,
            authVersion: "v2",
        } as unknown as Installation
        return installation
    }

    async deleteInstallation(query: {
        teamId?: string
        enterpriseId?: string
        userId?: string
        conversationId?: string
        isEnterpriseInstall: boolean
    }): Promise<void> {
        if (!query.teamId || !query.userId) return
        const { error } = await supabase
            .from("slack_installations")
            .delete()
            .eq("team_id", query.teamId)
            .eq("user_id", query.userId)
        if (error) throw error
    }
}

export const installationStore = new SupabaseInstallationStore()
