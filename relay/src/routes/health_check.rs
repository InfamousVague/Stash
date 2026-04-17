use axum::{
    http::StatusCode,
    Json,
};

/// GET /health -- public endpoint, returns relay status
pub async fn health_check() -> Result<Json<serde_json::Value>, StatusCode> {
    Ok(Json(serde_json::json!({
        "status": "ok",
        "version": env!("CARGO_PKG_VERSION"),
    })))
}
