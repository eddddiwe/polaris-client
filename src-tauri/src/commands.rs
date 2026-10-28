use crate::error::Result;
use crate::models::*;
use crate::mods::ModsService;
use crate::modpacks::ModpackService;
use crate::modrinth::ModrinthClient;
use crate::state::AppState;
use serde_json::Value;
use tauri::State;

// Mod commands
#[tauri::command]
pub async fn search_mods(
    query: String,
    project_type: String,
    limit: u32,
    offset: u32,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let client = ModrinthClient::new();
    let result = client.search(&query, &project_type, limit, offset).await.map_err(|e| e)?;
    Ok(serde_json::to_value(result).unwrap_or_default())
}

#[tauri::command]
pub async fn mod_detail(project_id: String, state: State<'_, AppState>) -> Result<Value, String> {
    let client = ModrinthClient::new();
    let project = client.project(&project_id).await.map_err(|e| e)?;
    Ok(serde_json::to_value(project).unwrap_or_default())
}

#[tauri::command]
pub async fn mod_versions(
    project_id: String,
    loader: String,
    game_version: String,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let client = ModrinthClient::new();
    let versions = client.versions(&project_id, &loader, &game_version).await.map_err(|e| e)?;
    Ok(serde_json::to_value(versions).unwrap_or_default())
}

#[tauri::command]
pub async fn install_mod(
    instance_id: String,
    project_id: String,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    // TODO: Implement full mod installation flow
    // 1. Fetch project info
    // 2. Fetch versions
    // 3. Pick best version
    // 4. Download file
    // 5. Save to mods directory
    // 6. Update mod index
    Ok(serde_json::json!({"status": "not_implemented", "message": "Mod installation coming soon"}))
}

#[tauri::command]
pub async fn list_mods(instance_id: String, state: State<'_, AppState>) -> Result<Value, String> {
    let mods_service = ModsService::new(state.instance_store.lock().unwrap().dir(&instance_id).join("mods").parent().unwrap().to_path_buf());
    let mods = mods_service.list(&instance_id);
    Ok(serde_json::to_value(mods).unwrap_or_default())
}

#[tauri::command]
pub async fn import_mrpack_full(state: State<'_, AppState>) -> Result<Value, String> {
    // TODO: Implement full .mrpack import with file dialog
    // 1. Show file dialog
    // 2. Read .mrpack (zip)
    // 3. Parse modrinth.index.json
    // 4. Create instance
    // 5. Download all mods
    // 6. Extract overrides
    Ok(serde_json::json!({"name": "Imported Modpack", "mcVersion": "1.21.1", "status": "stub"}))
}