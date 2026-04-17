mod auth;
mod config;
mod db;
mod middleware;
mod routes;

use std::sync::Arc;
use tracing_subscriber::EnvFilter;

use crate::config::RelayConfig;
use crate::db::Database;

pub struct AppState {
    pub db: Database,
    pub config: RelayConfig,
    pub master_key: Option<[u8; 32]>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env().add_directive("stash_relay=info".parse()?))
        .init();

    tracing::info!("Starting Stash Relay v{}", env!("CARGO_PKG_VERSION"));

    // Load config
    let config = RelayConfig::load()?;
    tracing::info!("Config loaded from {:?}", config.resolved_path());

    // Initialize database
    let db = Database::open(&config.data_dir())?;
    db.run_migrations()?;
    tracing::info!("Database initialized");

    // Setup or unlock master passphrase
    let master_key = auth::setup_or_unlock(&db, &config).await?;

    // Create app state
    let state = Arc::new(AppState {
        db,
        config: config.clone(),
        master_key: Some(master_key),
    });

    // Build router
    let app = routes::build_router(Arc::clone(&state));

    // Bind and serve
    let addr = format!("{}:{}", config.server.host, config.server.port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("Stash Relay listening on {}", addr);

    axum::serve(listener, app).await?;

    Ok(())
}
