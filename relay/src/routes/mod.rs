mod auth;
mod sync;
mod projects;
mod actions;
mod health_check;

use std::sync::Arc;
use axum::{
    Router,
    middleware,
    routing::{get, post, delete},
};
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;

use crate::AppState;
use crate::middleware::auth_middleware;

pub fn build_router(state: Arc<AppState>) -> Router {
    // Public routes (no auth required)
    let public = Router::new()
        .route("/auth/apple", post(auth::apple_sign_in))
        .route("/auth/apple-callback", post(auth::apple_web_callback))
        .route("/auth/link-redeem", post(auth::redeem_link_code))
        .route("/health", get(health_check::health_check));

    // Protected routes (require valid Bearer token)
    let protected = Router::new()
        // Auth management
        .route("/auth/token", post(auth::create_token))
        .route("/auth/token/:id", delete(auth::revoke_token))
        .route("/auth/user", delete(auth::delete_user))
        .route("/auth/devices", get(auth::list_devices))
        .route("/auth/device-key", post(auth::upsert_device_key))
        .route("/auth/device-keys", get(auth::list_device_keys))
        .route("/auth/device-key/:id", delete(auth::delete_device_key))
        .route("/auth/link-code", post(auth::create_link_code))
        // Sync
        .route("/sync", post(sync::full_sync))
        .route("/sync/profile", post(sync::profile_change))
        // Projects
        .route("/projects", get(projects::list_projects))
        .route("/projects/:id/profiles", get(projects::list_profiles))
        .route("/projects/:id/vars", get(projects::vars_active))
        .route("/projects/:id/vars/:profile", get(projects::vars_for_profile))
        // Pending actions
        .route("/projects/:id/switch", post(actions::request_switch))
        .route("/pending", get(actions::list_pending))
        .route("/pending/:id/complete", post(actions::complete_action))
        .route_layer(middleware::from_fn_with_state(state.clone(), auth_middleware));

    Router::new()
        .merge(public)
        .merge(protected)
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}
