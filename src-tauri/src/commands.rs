use crate::error::Result;
use crate::models::*;
use crate::mods::ModsService;
use crate::modpacks::ModpackService;
use crate::http::Downloader;
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
    instance_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let (loader, game_version) = if let Some(iid) = instance_id {
        let instance = {
            let instances = state.instances.lock().unwrap();
            instances.iter().find(|i| i.id == iid).cloned()
        };
        match instance {
            Some(inst) => (inst.loader, inst.mc_version),
            None => ("fabric".to_string(), String::new()),
        }
    } else {
        ("fabric".to_string(), String::new())
    };
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
    // Get instance info
    let instance = {
        let instances = state.instances.lock().unwrap();
        instances.iter().find(|i| i.id == instance_id).cloned()
    };
    let instance = instance.ok_or_else(|| format!("Instance not found: {}", instance_id))?;

    let instances_dir = state.data_dir.clone();
    let downloader = Downloader::new();
    let modrinth = ModrinthClient::new();

    let result = crate::mod_install::install_mod(
        &instance_id,
        &project_id,
        &instance.mc_version,
        &instance.loader,
        &instances_dir,
        &downloader,
        &modrinth,
    ).await?;

    Ok(result)
}

#[tauri::command]
pub async fn list_mods(instance_id: String, state: State<'_, AppState>) -> Result<Value, String> {
    let mods_service = ModsService::new(state.instance_store.lock().unwrap().dir(&instance_id).join("mods").parent().unwrap().to_path_buf());
    let mods = mods_service.list(&instance_id);
    Ok(serde_json::to_value(mods).unwrap_or_default())
}

#[tauri::command]
pub async fn mods_remove(instance_id: String, identifier: String, state: State<'_, AppState>) -> Result<(), String> {
    let mods_service = ModsService::new(state.instance_store.lock().unwrap().dir(&instance_id).join("mods").parent().unwrap().to_path_buf());
    mods_service.remove(&instance_id, &identifier)
}

#[tauri::command]
pub async fn mods_toggle(instance_id: String, filename: String, state: State<'_, AppState>) -> Result<(), String> {
    let mods_service = ModsService::new(state.instance_store.lock().unwrap().dir(&instance_id).join("mods").parent().unwrap().to_path_buf());
    mods_service.toggle(&instance_id, &filename)
}

#[tauri::command]
pub async fn mods_install_version(instance_id: String, version_id: String, state: State<'_, AppState>) -> Result<Value, String> {
    let instance = {
        let instances = state.instances.lock().unwrap();
        instances.iter().find(|i| i.id == instance_id).cloned()
    };
    let instance = instance.ok_or_else(|| format!("Instance not found: {}", instance_id))?;

    let instances_dir = state.data_dir.clone();
    let downloader = Downloader::new();
    let modrinth = ModrinthClient::new();

    // Fetch version info to get project_id
    // For now, use version_id as ref (modrinth version id)
    let result = crate::mod_install::install_mod(
        &instance_id,
        &version_id,
        &instance.mc_version,
        &instance.loader,
        &instances_dir,
        &downloader,
        &modrinth,
    ).await?;

    Ok(result)
}

#[tauri::command]
pub async fn mods_updates(instance_id: String, state: State<'_, AppState>) -> Result<Value, String> {
    // Stub: return empty updates list
    Ok(serde_json::json!([]))
}

#[tauri::command]
pub async fn mods_update_all(instance_id: String, project_ids: Option<Vec<String>>, state: State<'_, AppState>) -> Result<Value, String> {
    // Stub
    Ok(serde_json::json!({"status": "not_implemented"}))
}

#[tauri::command]
pub async fn mods_categories(project_type: String, state: State<'_, AppState>) -> Result<Value, String> {
    // Return common mod categories
    Ok(serde_json::json!([
        "adventure", "cursed", "decoration", "economy", "equipment",
        "food", "game-mechanics", "library", "magic", "management",
        "minigame", "mobs", "optimization", "social", "storage",
        "technology", "transportation", "utility", "worldgen"
    ]))
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