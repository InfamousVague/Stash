use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;
use std::sync::Arc;

use crate::AppState;

#[derive(Deserialize)]
pub struct SwitchRequest {
    pub profile: String,
}

/// POST /projects/:id/switch -- Request a profile switch (creates pending action)
pub async fn request_switch(
    State(state): State<Arc<AppState>>,
    axum::extract::Extension(user): axum::extract::Extension<crate::middleware::UserId>,
    Path(project_id): Path<String>,
    Json(body): Json<SwitchRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), StatusCode> {
    // Verify project belongs to user
    state.db.get_project(&user.0, &project_id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    let id = uuid::Uuid::new_v4().to_string();
    let payload = serde_json::json!({ "profile": body.profile }).to_string();

    state.db.create_pending_action(&id, &user.0, &project_id, "switch_profile", &payload)
        .map_err(|e| {
            tracing::error!("Failed to create pending action: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok((StatusCode::CREATED, Json(serde_json::json!({
        "id": id,
        "action_type": "switch_profile",
        "project_id": project_id,
        "profile": body.profile,
    }))))
}

/// GET /pending -- List pending actions for user (Mac daemon polls this)
pub async fn list_pending(
    State(state): State<Arc<AppState>>,
    axum::extract::Extension(user): axum::extract::Extension<crate::middleware::UserId>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let actions = state.db.list_pending_actions(&user.0)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let result: Vec<serde_json::Value> = actions.iter().map(|a| {
        serde_json::json!({
            "id": a.id,
            "project_id": a.project_id,
            "action_type": a.action_type,
            "payload": serde_json::from_str::<serde_json::Value>(&a.payload).unwrap_or(serde_json::Value::Null),
            "status": a.status,
            "created_at": a.created_at,
        })
    }).collect();

    Ok(Json(serde_json::json!(result)))
}

/// POST /pending/:id/complete -- Mark action as completed
pub async fn complete_action(
    State(state): State<Arc<AppState>>,
    axum::extract::Extension(user): axum::extract::Extension<crate::middleware::UserId>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let completed = state.db.complete_pending_action(&id, &user.0)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if !completed {
        return Err(StatusCode::NOT_FOUND);
    }

    Ok(Json(serde_json::json!({
        "id": id,
        "status": "completed",
    })))
}
