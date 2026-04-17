use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;
use std::sync::Arc;

use crate::AppState;

#[derive(Deserialize)]
pub struct ProjectListQuery {
    pub source_device_id: Option<String>,
}

/// GET /projects -- List all projects for user with summary info
pub async fn list_projects(
    State(state): State<Arc<AppState>>,
    axum::extract::Extension(user): axum::extract::Extension<crate::middleware::UserId>,
    axum::extract::Query(query): axum::extract::Query<ProjectListQuery>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let projects = if let Some(ref device_id) = query.source_device_id {
        state.db.list_projects_for_device(&user.0, device_id)
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    } else {
        state.db.list_projects(&user.0)
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    };

    let mut result = Vec::new();
    for p in &projects {
        let profiles = state.db.list_profiles(&p.id)
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        let profile_names: Vec<String> = profiles.iter().map(|pr| pr.name.clone()).collect();

        // Count variables per profile
        let mut profile_var_counts = serde_json::Map::new();
        for pr in &profiles {
            let count = state.db.variable_count_for_profile(&pr.id)
                .unwrap_or(0);
            profile_var_counts.insert(pr.name.clone(), serde_json::json!(count));
        }

        let health = state.db.get_health(&p.id)
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        let health_json = health.map(|h| serde_json::json!({
            "stale_count": h.stale_count,
            "expiring_count": h.expiring_count,
            "exposed_count": h.exposed_count,
        }));

        result.push(serde_json::json!({
            "id": p.id,
            "source_device_id": p.source_device_id,
            "name": p.name,
            "path": p.path,
            "framework": p.framework,
            "active_profile": p.active_profile,
            "profiles": profile_names,
            "variable_counts": profile_var_counts,
            "health": health_json,
        }));
    }

    Ok(Json(serde_json::json!(result)))
}

/// GET /projects/:id/profiles -- List profiles for a project
pub async fn list_profiles(
    State(state): State<Arc<AppState>>,
    axum::extract::Extension(user): axum::extract::Extension<crate::middleware::UserId>,
    Path(project_id): Path<String>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    // Verify project belongs to user
    let project = state.db.get_project(&user.0, &project_id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if project.is_none() {
        return Err(StatusCode::NOT_FOUND);
    }

    let profiles = state.db.list_profiles(&project_id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let result: Vec<serde_json::Value> = profiles.iter().map(|p| {
        let count = state.db.variable_count_for_profile(&p.id).unwrap_or(0);
        serde_json::json!({
            "id": p.id,
            "name": p.name,
            "variable_count": count,
            "created_at": p.created_at,
        })
    }).collect();

    Ok(Json(serde_json::json!(result)))
}

/// GET /projects/:id/vars -- Variables for active profile
pub async fn vars_active(
    State(state): State<Arc<AppState>>,
    axum::extract::Extension(user): axum::extract::Extension<crate::middleware::UserId>,
    Path(project_id): Path<String>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let project = state.db.get_project(&user.0, &project_id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    let active_profile = project.active_profile
        .ok_or(StatusCode::NOT_FOUND)?;

    let profile_id = state.db.get_profile_id(&project_id, &active_profile)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    let vars = state.db.list_variables(&profile_id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let result: Vec<serde_json::Value> = vars.iter().map(|v| {
        // v.value_encrypted column now holds the `encrypted_for` JSON blob:
        // {"device_id": "base64_ciphertext", ...}
        let encrypted_for: serde_json::Value =
            serde_json::from_str(&v.value_encrypted).unwrap_or_else(|_| serde_json::json!({}));
        serde_json::json!({
            "id": v.id,
            "key": v.key,
            "encrypted_for": encrypted_for,
        })
    }).collect();

    Ok(Json(serde_json::json!({
        "profile": active_profile,
        "variables": result,
    })))
}

/// GET /projects/:id/vars/:profile -- Variables for a specific profile
pub async fn vars_for_profile(
    State(state): State<Arc<AppState>>,
    axum::extract::Extension(user): axum::extract::Extension<crate::middleware::UserId>,
    Path((project_id, profile_name)): Path<(String, String)>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    // Verify project belongs to user
    state.db.get_project(&user.0, &project_id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    let profile_id = state.db.get_profile_id(&project_id, &profile_name)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    let vars = state.db.list_variables(&profile_id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let result: Vec<serde_json::Value> = vars.iter().map(|v| {
        // v.value_encrypted column now holds the `encrypted_for` JSON blob:
        // {"device_id": "base64_ciphertext", ...}
        let encrypted_for: serde_json::Value =
            serde_json::from_str(&v.value_encrypted).unwrap_or_else(|_| serde_json::json!({}));
        serde_json::json!({
            "id": v.id,
            "key": v.key,
            "encrypted_for": encrypted_for,
        })
    }).collect();

    Ok(Json(serde_json::json!({
        "profile": profile_name,
        "variables": result,
    })))
}
