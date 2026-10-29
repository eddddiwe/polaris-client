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
    let instance = {
        let instances = state.instances.lock().unwrap();
        instances.iter().find(|i| i.id == instance_id).cloned()
    };
    let instance = instance.ok_or_else(|| format!("Instance not found: {}", instance_id))?;

    let mods_service = ModsService::new(state.instance_store.lock().unwrap().dir(&instance_id).join("mods").parent().unwrap().to_path_buf());
    let mods = mods_service.list(&instance_id);
    let tracked: Vec<_> = mods.iter().filter(|m| !m.project_id.is_empty() && !m.version_id.is_empty()).collect();
    if tracked.is_empty() {
        return Ok(serde_json::json!([]));
    }

    // Collect sha1 hashes
    let mut hashes: Vec<String> = Vec::new();
    for m in &tracked {
        if let Some(sha) = &m.sha1 {
            if !sha.is_empty() { hashes.push(sha.clone()); }
        }
    }
    // If no hashes, return empty (can't check without hashes)
    if hashes.is_empty() {
        return Ok(serde_json::json!([]));
    }

    let client = ModrinthClient::new();
    let loaders = vec!["fabric".to_string()];
    let game_versions = vec![instance.mc_version.clone()];
    let updates = client.updates_for_hashes(&hashes, &loaders, &game_versions).await.unwrap_or_default();

    // Build result list
    let mut result = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for m in &tracked {
        if let Some(sha) = &m.sha1 {
            if let Some(new_version) = updates.get(sha) {
                if new_version.id == m.version_id { continue; }
                if seen.contains(&m.project_id) { continue; }
                seen.insert(m.project_id.clone());
                result.push(serde_json::json!({
                    "projectId": m.project_id,
                    "slug": m.slug,
                    "name": m.name,
                    "currentVersionNumber": m.version_number,
                    "newVersionNumber": new_version.version_number,
                    "newVersionId": new_version.id
                }));
            }
        }
    }

    Ok(serde_json::to_value(result).unwrap_or_default())
}

#[tauri::command]
pub async fn mods_update_all(instance_id: String, project_ids: Option<Vec<String>>, state: State<'_, AppState>) -> Result<Value, String> {
    // Get updates first
    let updates_val = mods_updates(instance_id.clone(), state.clone()).await?;
    let updates = updates_val.as_array().cloned().unwrap_or_default();

    let instances_dir = state.data_dir.clone();
    let downloader = Downloader::new();
    let modrinth = ModrinthClient::new();

    let instance = {
        let instances = state.instances.lock().unwrap();
        instances.iter().find(|i| i.id == instance_id).cloned()
    };
    let instance = instance.ok_or_else(|| format!("Instance not found: {}", instance_id))?;

    let mut installed = Vec::new();
    let mut failed = Vec::new();

    for upd in &updates {
        let new_version_id = upd.get("newVersionId").and_then(|v| v.as_str()).unwrap_or("");
        if new_version_id.is_empty() { continue; }
        // Filter by project_ids if provided
        if let Some(pids) = &project_ids {
            let pid = upd.get("projectId").and_then(|v| v.as_str()).unwrap_or("");
            if !pids.contains(&pid.to_string()) { continue; }
        }
        match crate::mod_install::install_mod(
            &instance_id,
            new_version_id,
            &instance.mc_version,
            &instance.loader,
            &instances_dir,
            &downloader,
            &modrinth,
        ).await {
            Ok(_) => {
                if let Some(name) = upd.get("name").and_then(|v| v.as_str()) {
                    installed.push(name.to_string());
                }
            }
            Err(e) => {
                if let Some(name) = upd.get("name").and_then(|v| v.as_str()) {
                    failed.push(serde_json::json!({"name": name, "error": e}));
                }
            }
        }
    }

    Ok(serde_json::json!({
        "installed": installed,
        "failed": failed
    }))
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