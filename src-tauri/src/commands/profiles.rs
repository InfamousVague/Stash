use crate::state::AppState;
use crate::profile_manager;

#[tauri::command]
pub fn list_profiles(
    state: tauri::State<'_, AppState>,
    project_id: String,
) -> Result<Vec<String>, String> {
    let projects = state.projects.lock().unwrap();
    let project = projects.iter()
        .find(|p| p.id == project_id)
        .ok_or("Project not found")?;

    Ok(profile_manager::list_profiles(&project.path))
}

#[tauri::command]
pub fn get_active_profile(
    state: tauri::State<'_, AppState>,
    project_id: String,
) -> Result<String, String> {
    let projects = state.projects.lock().unwrap();
    let project = projects.iter()
        .find(|p| p.id == project_id)
        .ok_or("Project not found")?;

    Ok(profile_manager::get_active_profile(&project.path))
}

#[tauri::command]
pub fn switch_profile(
    state: tauri::State<'_, AppState>,
    project_id: String,
    profile_name: String,
) -> Result<(), String> {
    let projects = state.projects.lock().unwrap();
    let project = projects.iter()
        .find(|p| p.id == project_id)
        .ok_or("Project not found")?;

    profile_manager::switch_profile(&project.path, &profile_name)
}

#[tauri::command]
pub fn create_profile(
    state: tauri::State<'_, AppState>,
    project_id: String,
    name: String,
    copy_from: Option<String>,
) -> Result<(), String> {
    let projects = state.projects.lock().unwrap();
    let project = projects.iter()
        .find(|p| p.id == project_id)
        .ok_or("Project not found")?;

    profile_manager::create_profile(&project.path, &name, copy_from.as_deref())
}

#[tauri::command]
pub fn delete_profile(
    state: tauri::State<'_, AppState>,
    project_id: String,
    name: String,
) -> Result<(), String> {
    let projects = state.projects.lock().unwrap();
    let project = projects.iter()
        .find(|p| p.id == project_id)
        .ok_or("Project not found")?;

    profile_manager::delete_profile(&project.path, &name)
}
