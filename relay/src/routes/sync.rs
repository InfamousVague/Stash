use axum::{
    extract::State,
    http::StatusCode,
    Json,
};
use serde::Deserialize;
use std::sync::Arc;

use crate::AppState;

#[derive(Deserialize)]
pub struct FullSyncRequest {
    /// The source device (Mac) pushing this sync. Used to scope the delete+insert
    /// so one Mac's sync doesn't overwrite another Mac's data (multi-workspace).
    pub source_device_id: String,
    pub projects: Vec<SyncProject>,
}

#[derive(Deserialize)]
pub struct SyncProject {
    pub id: String,
    pub name: String,
    pub path: Option<String>,
    pub framework: Option<String>,
    pub active_profile: Option<String>,
    pub profiles: Vec<SyncProfile>,
    pub health: Option<SyncHealth>,
}

#[derive(Deserialize)]
pub struct SyncProfile {
    pub name: String,
    pub variables: Vec<SyncVariable>,
}

#[derive(Deserialize)]
pub struct SyncVariable {
    pub key: String,
    /// Map of device_id → base64 ciphertext (per-device E2E encryption).
    pub encrypted_for: std::collections::HashMap<String, String>,
}

#[derive(Deserialize)]
pub struct SyncHealth {
    pub stale_count: i64,
    pub expiring_count: i64,
    pub exposed_count: i64,
}

/// POST /sync -- Full state push from Mac. Replaces all data for the user.
pub async fn full_sync(
    State(state): State<Arc<AppState>>,
    axum::extract::Extension(user): axum::extract::Extension<crate::middleware::UserId>,
    Json(body): Json<FullSyncRequest>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let user_id = &user.0;
    let source_device_id = &body.source_device_id;

    // Delete existing project data scoped to this source device (workspace).
    // Other devices' data stays intact.
    state.db.delete_projects_for_device(user_id, source_device_id)
        .map_err(|e| {
            tracing::error!("Failed to delete existing projects: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    // Insert all projects
    let project_tuples: Vec<(String, String, Option<String>, Option<String>, Option<String>)> = body.projects.iter()
        .map(|p| (p.id.clone(), p.name.clone(), p.path.clone(), p.framework.clone(), p.active_profile.clone()))
        .collect();

    state.db.upsert_projects(user_id, source_device_id, &project_tuples)
        .map_err(|e| {
            tracing::error!("Failed to upsert projects: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    // Insert profiles and variables for each project
    for project in &body.projects {
        for profile in &project.profiles {
            let profile_id = uuid::Uuid::new_v4().to_string();

            state.db.upsert_profiles(&project.id, &[(profile_id.clone(), profile.name.clone())])
                .map_err(|e| {
                    tracing::error!("Failed to upsert profiles: {}", e);
                    StatusCode::INTERNAL_SERVER_ERROR
                })?;

            let var_tuples: Vec<(String, String, String)> = profile.variables.iter()
                .map(|v| {
                    let encrypted_for_json = serde_json::to_string(&v.encrypted_for)
                        .unwrap_or_else(|_| "{}".to_string());
                    (uuid::Uuid::new_v4().to_string(), v.key.clone(), encrypted_for_json)
                })
                .collect();

            state.db.upsert_variables(&profile_id, &var_tuples)
                .map_err(|e| {
                    tracing::error!("Failed to upsert variables: {}", e);
                    StatusCode::INTERNAL_SERVER_ERROR
                })?;
        }

        // Upsert health if provided
        if let Some(ref health) = project.health {
            state.db.upsert_health(&project.id, health.stale_count, health.expiring_count, health.exposed_count)
                .map_err(|e| {
                    tracing::error!("Failed to upsert health: {}", e);
                    StatusCode::INTERNAL_SERVER_ERROR
                })?;
        }
    }

    let count = body.projects.len();
    tracing::info!("Full sync for user {}: {} projects", &user_id[..8.min(user_id.len())], count);

    Ok(Json(serde_json::json!({
        "synced": count,
    })))
}

#[derive(Deserialize)]
pub struct ProfileChangeRequest {
    pub project_id: String,
    pub active_profile: String,
}

/// POST /sync/profile -- Quick profile change notification
pub async fn profile_change(
    State(state): State<Arc<AppState>>,
    axum::extract::Extension(user): axum::extract::Extension<crate::middleware::UserId>,
    Json(body): Json<ProfileChangeRequest>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let updated = state.db.update_active_profile(&user.0, &body.project_id, &body.active_profile)
        .map_err(|e| {
            tracing::error!("Failed to update active profile: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    if !updated {
        return Err(StatusCode::NOT_FOUND);
    }

    Ok(Json(serde_json::json!({
        "project_id": body.project_id,
        "active_profile": body.active_profile,
    })))
}
