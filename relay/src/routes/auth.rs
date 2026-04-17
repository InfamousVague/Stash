use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
    response::Html,
};
use serde::Deserialize;
use std::sync::Arc;

use crate::AppState;
use crate::auth::{generate_token, hash_token};

use rand::Rng;

#[derive(Deserialize)]
#[allow(dead_code)]
pub struct AppleSignInRequest {
    pub identity_token: String,
    pub user_identifier: String,
    pub email: Option<String>,
}

/// POST /auth/apple -- Sign in with Apple.
/// Verifies the Apple identity token, provisions or finds the user,
/// and returns an API token for the device.
pub async fn apple_sign_in(
    State(state): State<Arc<AppState>>,
    Json(body): Json<AppleSignInRequest>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let claims = verify_apple_identity_token(&body.identity_token)
        .await
        .map_err(|e| {
            tracing::warn!("Apple token verification failed: {}", e);
            StatusCode::UNAUTHORIZED
        })?;

    let apple_user_id = claims.sub;

    let user_id = state.db.find_or_create_user(&apple_user_id, body.email.as_deref())
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Replace existing token for this Apple user
    let label = format!("apple:{}", apple_user_id);
    if let Ok(Some(existing_token_id)) = state.db.find_token_by_label(&label) {
        let _ = state.db.delete_token(&existing_token_id);
    }

    let token = generate_token();
    let token_hash = hash_token(&token)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let id = uuid::Uuid::new_v4().to_string();
    state.db.store_token(&id, &user_id, &label, &token_hash, Some("apple"))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    tracing::info!("Apple sign-in: user {} ({})", &user_id[..8.min(user_id.len())], &apple_user_id[..8.min(apple_user_id.len())]);

    Ok(Json(serde_json::json!({
        "token": token,
        "user_id": user_id,
    })))
}

// ─── Web-based Sign in with Apple callback ─────────────────

#[derive(Deserialize)]
#[allow(dead_code)]
pub struct AppleWebCallbackForm {
    pub id_token: String,
    pub code: Option<String>,
    pub state: Option<String>,
    pub user: Option<String>,
}

/// POST /auth/apple-callback -- Web Sign in with Apple callback.
/// Apple POSTs form-urlencoded data after the user authenticates in the browser.
/// We verify the JWT, find/create the user, generate a token, and serve an HTML
/// page that redirects to the `stash://` deep link with the token.
pub async fn apple_web_callback(
    State(state): State<Arc<AppState>>,
    axum::extract::Form(form): axum::extract::Form<AppleWebCallbackForm>,
) -> Html<String> {
    // 1. Verify the id_token JWT
    let claims = match verify_apple_identity_token(&form.id_token).await {
        Ok(c) => c,
        Err(e) => {
            tracing::warn!("Web callback: token verification failed: {}", e);
            return Html(format!(
                "<html><body><h2>Sign in failed</h2><p>{}</p></body></html>", e
            ));
        }
    };

    let apple_user_id = claims.sub;

    // 2. Extract email from the user JSON (only sent on first auth)
    let email = form.user.as_ref()
        .and_then(|u| serde_json::from_str::<serde_json::Value>(u).ok())
        .and_then(|v| v["email"].as_str().map(|s| s.to_string()));

    // 3. Find or create user
    let user_id = match state.db.find_or_create_user(&apple_user_id, email.as_deref()) {
        Ok(id) => id,
        Err(_) => return Html(
            "<html><body><h2>Server error</h2></body></html>".to_string()
        ),
    };

    // 4. Generate API token
    let token = generate_token();
    let token_hash = match hash_token(&token) {
        Ok(h) => h,
        Err(_) => return Html(
            "<html><body><h2>Server error</h2></body></html>".to_string()
        ),
    };

    let token_id = uuid::Uuid::new_v4().to_string();
    let label = format!("web:{}", &apple_user_id[..8.min(apple_user_id.len())]);
    let _ = state.db.store_token(&token_id, &user_id, &label, &token_hash, Some("mac"));

    tracing::info!("Web sign-in: user {} via Apple", &user_id[..8.min(user_id.len())]);

    // 5. Serve HTML that redirects to the Stash deep link with the token
    let html = format!(r#"<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Stash — Signed In</title>
    <style>
        body {{ font-family: -apple-system, system-ui, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #0a0a0a; color: #fff; }}
        .card {{ text-align: center; padding: 40px; }}
        h2 {{ color: #34d399; margin-bottom: 8px; }}
        p {{ color: #888; margin-bottom: 24px; }}
        a {{ color: #34d399; text-decoration: none; padding: 12px 24px; border: 1px solid #34d399; border-radius: 8px; }}
    </style>
</head>
<body>
    <div class="card">
        <h2>Signed In</h2>
        <p>Redirecting to Stash...</p>
        <a href="stash://auth-complete?token={token}">Open Stash</a>
    </div>
    <script>
        window.location.href = "stash://auth-complete?token={token}";
    </script>
</body>
</html>"#);

    Html(html)
}

#[derive(Debug)]
struct AppleClaims {
    sub: String,
}

/// Verify an Apple identity token JWT.
async fn verify_apple_identity_token(token: &str) -> anyhow::Result<AppleClaims> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        anyhow::bail!("Invalid JWT format");
    }

    use base64::Engine;
    let header_bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(parts[0])?;
    let header: serde_json::Value = serde_json::from_slice(&header_bytes)?;
    let kid = header["kid"].as_str()
        .ok_or_else(|| anyhow::anyhow!("Missing kid in JWT header"))?;

    let client = reqwest::Client::new();
    let keys_response = client
        .get("https://appleid.apple.com/auth/keys")
        .send()
        .await?
        .json::<serde_json::Value>()
        .await?;

    let keys = keys_response["keys"].as_array()
        .ok_or_else(|| anyhow::anyhow!("Invalid Apple JWKS response"))?;

    let matching_key = keys.iter()
        .find(|k| k["kid"].as_str() == Some(kid))
        .ok_or_else(|| anyhow::anyhow!("No matching Apple public key for kid: {}", kid))?;

    let n = matching_key["n"].as_str()
        .ok_or_else(|| anyhow::anyhow!("Missing 'n' in Apple key"))?;
    let e = matching_key["e"].as_str()
        .ok_or_else(|| anyhow::anyhow!("Missing 'e' in Apple key"))?;

    let n_bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(n)?;
    let e_bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(e)?;

    use rsa::{RsaPublicKey, pkcs1v15::VerifyingKey, BigUint};
    use sha2::Sha256;
    use signature::Verifier;

    let public_key = RsaPublicKey::new(
        BigUint::from_bytes_be(&n_bytes),
        BigUint::from_bytes_be(&e_bytes),
    )?;

    let verifying_key = VerifyingKey::<Sha256>::new(public_key);
    let message = format!("{}.{}", parts[0], parts[1]);
    let signature_bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(parts[2])?;
    let sig = rsa::pkcs1v15::Signature::try_from(signature_bytes.as_slice())?;

    verifying_key.verify(message.as_bytes(), &sig)?;

    let claims_bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(parts[1])?;
    let claims: serde_json::Value = serde_json::from_slice(&claims_bytes)?;

    let iss = claims["iss"].as_str().unwrap_or("");
    if iss != "https://appleid.apple.com" {
        anyhow::bail!("Invalid issuer: {}", iss);
    }

    let aud = claims["aud"].as_str().unwrap_or("");
    let valid_audiences = [
        "com.mattssoftware.stash.watchkitapp",
        "com.mattssoftware.stash",
        "com.mattssoftware.stash.web",
    ];
    if !valid_audiences.contains(&aud) {
        anyhow::bail!("Invalid audience: {}", aud);
    }

    let exp = claims["exp"].as_i64().unwrap_or(0);
    let now = chrono::Utc::now().timestamp();
    if now > exp {
        anyhow::bail!("Token expired");
    }

    let sub = claims["sub"].as_str()
        .ok_or_else(|| anyhow::anyhow!("Missing sub claim"))?
        .to_string();

    Ok(AppleClaims { sub })
}

#[derive(Deserialize)]
pub struct CreateTokenRequest {
    pub label: String,
    pub device_type: Option<String>,
}

/// POST /auth/token -- create a new API token (requires auth)
pub async fn create_token(
    State(state): State<Arc<AppState>>,
    axum::extract::Extension(user): axum::extract::Extension<crate::middleware::UserId>,
    Json(body): Json<CreateTokenRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), StatusCode> {
    let token = generate_token();
    let token_hash = hash_token(&token)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let id = uuid::Uuid::new_v4().to_string();
    state.db.store_token(&id, &user.0, &body.label, &token_hash, body.device_type.as_deref())
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok((StatusCode::CREATED, Json(serde_json::json!({
        "id": id,
        "token": token,
        "label": body.label,
        "device_type": body.device_type,
    }))))
}

/// DELETE /auth/token/:id -- revoke a token
pub async fn revoke_token(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    state.db.delete_token(&id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(StatusCode::NO_CONTENT)
}

/// GET /auth/devices -- list all linked devices (tokens) for the user
pub async fn list_devices(
    State(state): State<Arc<AppState>>,
    axum::extract::Extension(user): axum::extract::Extension<crate::middleware::UserId>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let devices = state.db.list_linked_devices(&user.0)
        .map_err(|e| {
            tracing::error!("Failed to list devices: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let device_list: Vec<serde_json::Value> = devices.into_iter().map(|(id, label, device_type, last_used)| {
        serde_json::json!({
            "id": id,
            "label": label,
            "device_type": device_type,
            "last_used": last_used,
        })
    }).collect();

    Ok(Json(serde_json::json!({
        "count": device_list.len(),
        "devices": device_list,
    })))
}

// ─── Device keys (for E2E encryption) ───────────────────────────

#[derive(Deserialize)]
pub struct UpsertDeviceKeyRequest {
    pub device_id: String,
    pub public_key: String,  // base64 X25519 public key
    pub device_type: String, // "watch", "ios", "mac", etc.
    pub label: Option<String>,
    pub lan_ip: Option<String>,
    pub lan_port: Option<u16>,
}

/// POST /auth/device-key -- upload this device's X25519 public key so
/// other devices on the account can encrypt values for it.
pub async fn upsert_device_key(
    State(state): State<Arc<AppState>>,
    axum::extract::Extension(user): axum::extract::Extension<crate::middleware::UserId>,
    Json(body): Json<UpsertDeviceKeyRequest>,
) -> Result<StatusCode, StatusCode> {
    state.db.upsert_device_key(
        &body.device_id,
        &user.0,
        &body.public_key,
        &body.device_type,
        body.label.as_deref(),
        body.lan_ip.as_deref(),
        body.lan_port,
    )
    .map_err(|e| {
        tracing::error!("Failed to upsert device key: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    tracing::info!("Device key registered: user={} device={} type={}",
        &user.0[..8.min(user.0.len())], &body.device_id[..8.min(body.device_id.len())], body.device_type);
    Ok(StatusCode::NO_CONTENT)
}

/// GET /auth/device-keys -- list all device public keys for the user.
/// The Mac daemon calls this on each sync to encrypt values for all peers.
pub async fn list_device_keys(
    State(state): State<Arc<AppState>>,
    axum::extract::Extension(user): axum::extract::Extension<crate::middleware::UserId>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let keys = state.db.list_device_keys(&user.0)
        .map_err(|e| {
            tracing::error!("Failed to list device keys: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let device_list: Vec<serde_json::Value> = keys.into_iter().map(|(id, public_key, device_type, label, lan_ip, lan_port, lan_updated_at)| {
        serde_json::json!({
            "device_id": id,
            "public_key": public_key,
            "device_type": device_type,
            "label": label,
            "lan_ip": lan_ip,
            "lan_port": lan_port,
            "lan_updated_at": lan_updated_at,
        })
    }).collect();

    Ok(Json(serde_json::json!({
        "devices": device_list,
    })))
}

/// DELETE /auth/device-key/:id -- remove a device's public key
pub async fn delete_device_key(
    State(state): State<Arc<AppState>>,
    axum::extract::Extension(user): axum::extract::Extension<crate::middleware::UserId>,
    axum::extract::Path(device_id): axum::extract::Path<String>,
) -> Result<StatusCode, StatusCode> {
    state.db.delete_device_key(&device_id, &user.0)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    state.db.delete_projects_for_device(&user.0, &device_id)
        .map_err(|e| {
            tracing::error!("Failed to cleanup projects for device {}: {}", &device_id, e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    Ok(StatusCode::NO_CONTENT)
}

/// DELETE /auth/user -- delete the authenticated user's account and all data
pub async fn delete_user(
    State(state): State<Arc<AppState>>,
    axum::extract::Extension(user): axum::extract::Extension<crate::middleware::UserId>,
) -> Result<StatusCode, StatusCode> {
    state.db.delete_user(&user.0)
        .map_err(|e| {
            tracing::error!("Failed to delete user {}: {}", &user.0, e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    tracing::info!("User {} deleted their account", &user.0);
    Ok(StatusCode::NO_CONTENT)
}

/// Generate a 6-character code from unambiguous uppercase alphanumeric chars.
fn generate_link_code() -> String {
    const CHARSET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let mut rng = rand::thread_rng();
    (0..6)
        .map(|_| {
            let idx = rng.gen_range(0..CHARSET.len());
            CHARSET[idx] as char
        })
        .collect()
}

/// POST /auth/link-code -- generate a short-lived device linking code (requires auth)
pub async fn create_link_code(
    State(state): State<Arc<AppState>>,
    axum::extract::Extension(user): axum::extract::Extension<crate::middleware::UserId>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let code = generate_link_code();
    let id = uuid::Uuid::new_v4().to_string();
    let expires_at = (chrono::Utc::now() + chrono::Duration::minutes(5))
        .format("%Y-%m-%d %H:%M:%S")
        .to_string();

    state.db.create_link_code(&id, &user.0, &code, &expires_at)
        .map_err(|e| {
            tracing::error!("Failed to create link code: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    tracing::info!("Link code created for user {}", &user.0[..8.min(user.0.len())]);

    Ok(Json(serde_json::json!({
        "code": code,
        "expires_in": 300,
    })))
}

#[derive(Deserialize)]
pub struct LinkRedeemRequest {
    pub code: String,
}

/// POST /auth/link-redeem -- redeem a device linking code (public, no auth)
pub async fn redeem_link_code(
    State(state): State<Arc<AppState>>,
    Json(body): Json<LinkRedeemRequest>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let code = body.code.trim().to_uppercase();

    let user_id = state.db.redeem_link_code(&code)
        .map_err(|e| {
            tracing::error!("Failed to redeem link code: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .ok_or(StatusCode::UNAUTHORIZED)?;

    // Generate a new API token for the linked device
    let token = generate_token();
    let token_hash = hash_token(&token)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let token_id = uuid::Uuid::new_v4().to_string();
    let label = format!("linked:{}", &token_id[..8]);
    state.db.store_token(&token_id, &user_id, &label, &token_hash, Some("mac"))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    tracing::info!("Link code redeemed for user {}", &user_id[..8.min(user_id.len())]);

    Ok(Json(serde_json::json!({
        "token": token,
    })))
}
