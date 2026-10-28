mod accounts;
mod commands;
mod cosmetics;
mod error;
mod hardware;
mod http;
mod instances;
mod java;
mod models;
mod mods;
mod modpacks;
mod modrinth;
mod paths;
mod settings;
mod state;
mod updates;

use crate::accounts::AccountStore;
use crate::commands::*;
use crate::cosmetics::CosmeticsService;
use crate::error::Result;
use crate::hardware::detect_hardware;
use crate::instances::InstanceStore;
use crate::java::scan_java;
use crate::models::*;
use crate::paths::{create_paths, resolve_root};
use crate::settings::SettingsStore;
use crate::state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let data_dir = resolve_root();
    let paths = create_paths(data_dir.clone());

    // Ensure directories exist
    let _ = std::fs::create_dir_all(&paths.root);
    let _ = std::fs::create_dir_all(&paths.instances);
    let _ = std::fs::create_dir_all(&paths.versions);
    let _ = std::fs::create_dir_all(&paths.libraries);
    let _ = std::fs::create_dir_all(&paths.assets);
    let _ = std::fs::create_dir_all(&paths.meta);
    let _ = std::fs::create_dir_all(&paths.java);
    let _ = std::fs::create_dir_all(&paths.cache);
    let _ = std::fs::create_dir_all(&paths.logs);
    let _ = std::fs::create_dir_all(&paths.downloads);

    let settings_store = SettingsStore::new(paths.settings.clone());
    let instance_store = InstanceStore::new(paths.instances.clone());
    let account_store = AccountStore::new(paths.accounts.clone());

    let state = AppState::new(paths.root.clone(), settings_store, instance_store, account_store);

    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().level(log::LevelFilter::Info).build())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            bootstrap,
            list_instances,
            create_instance,
            delete_instance,
            get_settings,
            update_settings,
            list_accounts,
            add_offline_account,
            remove_account,
            set_active_account,
            check_for_updates,
            install_update,
            scan_java_cmd,
            get_hardware,
            cosmetics_snapshot,
            cosmetics_buy,
            cosmetics_equip,
            cosmetics_claim,
            fabric_loaders,
            fabric_ensure,
            import_mrpack,
            update_instance,
            search_mods,
            mod_detail,
            mod_versions,
            install_mod,
            list_mods,
        ])
        .setup(|_app| {
            let state = _app.state::<AppState>();
            log::info!("Polaris starting, data dir: {:?}", state.data_dir);

            // Load settings
            if let Ok(s) = state.settings_store.lock().unwrap().load() {
                *state.settings.lock().unwrap() = s;
            }

            // Load accounts
            let accounts = state.account_store.lock().unwrap().list();
            *state.accounts.lock().unwrap() = accounts;
            if let Some(active) = state.account_store.lock().unwrap().active() {
                *state.active_account_id.lock().unwrap() = Some(active.id);
            }

            // Load instances
            let rt = tokio::runtime::Runtime::new().unwrap();
            if let Ok(instances) = rt.block_on(state.instance_store.lock().unwrap().list()) {
                *state.instances.lock().unwrap() = instances;
            }

            // Hardware detection
            let hw = detect_hardware();
            *state.hardware.lock().unwrap() = hw;

            // Scan Java
            let java_paths = scan_java(&[]);
            *state.java.lock().unwrap() = java_paths;

            *state.initialized.lock().unwrap() = true;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}

// Commands

#[tauri::command]
fn bootstrap(state: tauri::State<'_, AppState>) -> Result<Bootstrap, String> {
    let settings = state.settings.lock().unwrap().clone();
    let instances = state.instances.lock().unwrap().clone();
    let accounts = state.accounts.lock().unwrap().clone();
    let active_account_id = state.active_account_id.lock().unwrap().clone();
    let hardware = state.hardware.lock().unwrap().clone();
    let launch = state.launch_state.lock().unwrap().clone();
    let java = state.java.lock().unwrap().clone();
    let java_info: Vec<JavaInfo> = java.iter().map(|p| JavaInfo {
        path: p.clone(),
        version: "Unknown".to_string(),
        major: 0,
    }).collect();
    let latest_version = state.latest_version.lock().unwrap().clone();
    let update_info = state.update_info.lock().unwrap().clone();

    Ok(Bootstrap {
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        settings,
        instances,
        accounts,
        active_account_id,
        hardware,
        launch,
        java: java_info,
        data_dir: state.data_dir.to_string_lossy().to_string(),
        packs: vec![],
        latest_version,
        update_info,
    })
}

#[tauri::command]
fn list_instances(state: tauri::State<'_, AppState>) -> Result<Vec<Instance>, String> {
    let instances = state.instances.lock().unwrap();
    Ok(instances.clone())
}

#[tauri::command]
fn create_instance(name: String, mc_version: String, loader: String, state: tauri::State<'_, AppState>) -> Result<Instance, String> {
    let instance_store = state.instance_store.lock().unwrap();
    let rt = tokio::runtime::Runtime::new().unwrap();
    let config = rt.block_on(instance_store.create(name, mc_version, loader)).map_err(|e| e)?;
    state.instances.lock().unwrap().push(config.clone());
    Ok(config)
}

#[tauri::command]
fn delete_instance(id: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let instance_store = state.instance_store.lock().unwrap();
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(instance_store.remove(&id)).map_err(|e| e)?;
    state.instances.lock().unwrap().retain(|i| i.id != id);
    Ok(())
}

#[tauri::command]
fn get_settings(state: tauri::State<'_, AppState>) -> Result<Settings, String> {
    let settings = state.settings.lock().unwrap();
    Ok(settings.clone())
}

#[tauri::command]
fn update_settings(patch: Settings, state: tauri::State<'_, AppState>) -> Result<Settings, String> {
    let settings_store = state.settings_store.lock().unwrap();
    let updated = settings_store.update(&patch).map_err(|e| e)?;
    *state.settings.lock().unwrap() = updated.clone();
    Ok(updated)
}

#[tauri::command]
fn list_accounts(state: tauri::State<'_, AppState>) -> Result<Vec<Account>, String> {
    let accounts = state.accounts.lock().unwrap();
    Ok(accounts.clone())
}

#[tauri::command]
fn add_offline_account(name: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let account_store = state.account_store.lock().unwrap();
    let account = account_store.add_offline(&name).map_err(|e| e)?;
    state.accounts.lock().unwrap().push(account);
    if let Some(last) = state.accounts.lock().unwrap().last() {
        *state.active_account_id.lock().unwrap() = Some(last.id.clone());
    }
    Ok(())
}

#[tauri::command]
fn remove_account(id: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let account_store = state.account_store.lock().unwrap();
    account_store.remove(&id).map_err(|e| e)?;
    state.accounts.lock().unwrap().retain(|a| a.id != id);
    Ok(())
}

#[tauri::command]
fn set_active_account(id: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let account_store = state.account_store.lock().unwrap();
    account_store.set_active(&id).map_err(|e| e)?;
    for a in state.accounts.lock().unwrap().iter_mut() {
        a.active = a.id == id;
    }
    *state.active_account_id.lock().unwrap() = Some(id);
    Ok(())
}

#[tauri::command]
async fn check_for_updates() -> Result<UpdateInfo, String> {
    let current = env!("CARGO_PKG_VERSION");
    Ok(updates::check_for_updates(current).await)
}

#[tauri::command]
async fn install_update(download_url: String) -> Result<(), String> {
    updates::install_update(&download_url).await
}

#[tauri::command]
fn scan_java_cmd() -> Result<Vec<String>, String> {
    Ok(scan_java(&[]))
}

#[tauri::command]
fn get_hardware(state: tauri::State<'_, AppState>) -> Result<HardwareInfo, String> {
    let hardware = state.hardware.lock().unwrap();
    Ok(hardware.clone())
}

#[tauri::command]
fn cosmetics_snapshot(state: tauri::State<'_, AppState>) -> Result<serde_json::Value, String> {
    let cosmetics = state.cosmetics.lock().unwrap();
    let snapshot = cosmetics.snapshot(0);
    Ok(serde_json::to_value(snapshot).unwrap_or_default())
}

#[tauri::command]
fn cosmetics_buy(id: String, state: tauri::State<'_, AppState>) -> Result<serde_json::Value, String> {
    let cosmetics = state.cosmetics.lock().unwrap();
    let snapshot = cosmetics.buy(&id).map_err(|e| e)?;
    Ok(serde_json::to_value(snapshot).unwrap_or_default())
}

#[tauri::command]
fn cosmetics_equip(id: String, state: tauri::State<'_, AppState>) -> Result<serde_json::Value, String> {
    let cosmetics = state.cosmetics.lock().unwrap();
    let snapshot = cosmetics.equip(&id).map_err(|e| e)?;
    Ok(serde_json::to_value(snapshot).unwrap_or_default())
}

#[tauri::command]
fn cosmetics_claim(playtime_ms: i64, state: tauri::State<'_, AppState>) -> Result<u32, String> {
    let cosmetics = state.cosmetics.lock().unwrap();
    cosmetics.claim(playtime_ms).map_err(|e| e)
}

#[tauri::command]
fn fabric_loaders(mc_version: String) -> Result<Vec<serde_json::Value>, String> {
    let _ = mc_version;
    Ok(vec![
        serde_json::json!({"version": "0.16.0", "stable": true}),
        serde_json::json!({"version": "0.15.11", "stable": true}),
    ])
}

#[tauri::command]
fn fabric_ensure(mc_version: String, preferred_loader: Option<String>) -> Result<serde_json::Value, String> {
    let loader = preferred_loader.unwrap_or_else(|| "0.16.0".to_string());
    Ok(serde_json::json!({
        "versionId": format!("fabric-loader-{}-{}", loader, mc_version),
        "loaderVersion": loader
    }))
}

#[tauri::command]
fn import_mrpack() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({"name": "Imported Modpack", "mcVersion": "1.21.1"}))
}

#[tauri::command]
fn update_instance(id: String, patch: serde_json::Value, state: tauri::State<'_, AppState>) -> Result<Instance, String> {
    let instance_store = state.instance_store.lock().unwrap();
    let rt = tokio::runtime::Runtime::new().unwrap();
    let updated = rt.block_on(instance_store.update(&id, patch)).map_err(|e| e)?;
    // Update in-memory list
    let mut instances = state.instances.lock().unwrap();
    if let Some(idx) = instances.iter().position(|i| i.id == id) {
        instances[idx] = updated.clone();
    }
    Ok(updated)
}
