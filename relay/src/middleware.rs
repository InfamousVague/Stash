use axum::{
    extract::{Request, State},
    http::StatusCode,
    middleware::Next,
    response::Response,
};
use std::sync::Arc;

use crate::AppState;
use crate::auth::verify_token;

/// Auth middleware -- extracts Bearer token from Authorization header,
/// verifies it against stored Argon2 hashes, and injects UserId into extensions.
pub async fn auth_middleware(
    State(state): State<Arc<AppState>>,
    mut req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let auth_header = req.headers()
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let token = auth_header.strip_prefix("Bearer ")
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let token_hashes = state.db.all_token_hashes()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut matched: Option<(String, String)> = None;
    for (id, user_id, hash) in &token_hashes {
        if verify_token(token, hash) {
            matched = Some((id.clone(), user_id.clone()));
            break;
        }
    }

    let (token_id, user_id) = matched.ok_or(StatusCode::UNAUTHORIZED)?;

    let _ = state.db.update_token_last_used(&token_id);

    req.extensions_mut().insert(UserId(user_id));

    Ok(next.run(req).await)
}

/// The authenticated user's ID, injected by auth middleware.
#[derive(Clone, Debug)]
pub struct UserId(pub String);
