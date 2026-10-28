mod accounts;
mod commands;
mod cosmetics;
mod cosmetic_sync;
mod error;
mod events;
mod hardware;
mod http;
mod instances;
mod installer;
mod java;
mod launch;
mod models;
mod mod_install;
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
            window_action,
            open_external,
            open_root,
            install_instance,
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
            cosmetic_sync_get,
            import_mrpack,
            update_instance,
            launch_game,
            stop_game,
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
fn window_action(action: String, app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    if let Some(window) = app.get_webview_window("main") {
        match action.as_str() {
            "minimize" => { let _ = window.minimize(); }
            "maximize" => { let _ = window.maximize(); }
            "close" => { let _ = window.close(); }
            "show" => { let _ = window.show(); }
            _ => {}
        }
    }
    Ok(())
}

#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &url])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn open_root() -> Result<(), String> {
    // Open the data directory
    Ok(())
}

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
async fn install_instance(instance_id: String, state: tauri::State<'_, AppState>) -> Result<serde_json::Value, String> {
    let instance = {
        let instances = state.instances.lock().unwrap();
        instances.iter().find(|i| i.id == instance_id).cloned()
    };
    let instance = instance.ok_or_else(|| format!("Instance not found: {}", instance_id))?;

    let installer = crate::installer::Installer::new(crate::installer::InstallerPaths {
        versions: state.data_dir.join("versions"),
        libraries: state.data_dir.join("libraries"),
        assets: state.data_dir.join("assets"),
        meta: state.data_dir.join("meta"),
    });

    let mirror_cache = state.settings.lock().unwrap().mirror_vanilla_cache;
    let installed = installer.install(&instance.mc_version, &instance.loader, instance.loader_version.as_deref(), mirror_cache).await
        .map_err(|e| e.to_string())?;

    // Update instance with loader version if fabric
    if instance.loader == "fabric" {
        if let Some(lv) = &installed.version_id.strip_prefix("fabric-loader-").and_then(|s| s.split('-').next()) {
            // Extract loader version from version_id
        }
    }

    Ok(serde_json::json!({
        "versionId": installed.version_id,
        "baseVersionId": installed.base_version_id,
        "jarPath": installed.jar_path,
        "classpath": installed.classpath,
        "assetIndexId": installed.asset_index_id,
        "javaMajor": installed.java_major,
        "status": "installed"
    }))
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
    let client = reqwest::Client::new();
    let rt = tokio::runtime::Runtime::new().unwrap();
    let res = rt.block_on(client.get(format!("https://meta.fabricmc.net/v2/versions/loader/{}", mc_version)).send())
        .map_err(|e| e.to_string())?;
    let loaders: Vec<serde_json::Value> = rt.block_on(res.json()).map_err(|e| e.to_string())?;
    Ok(loaders)
}

#[tauri::command]
fn fabric_ensure(mc_version: String, preferred_loader: Option<String>) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let rt = tokio::runtime::Runtime::new().unwrap();

    let loader = if let Some(lv) = preferred_loader {
        lv
    } else {
        let res = rt.block_on(client.get(format!("https://meta.fabricmc.net/v2/versions/loader/{}", mc_version)).send())
            .map_err(|e| e.to_string())?;
        let loaders: Vec<serde_json::Value> = rt.block_on(res.json()).map_err(|e| e.to_string())?;
        loaders.iter()
            .find(|l| l.get("loader").and_then(|x| x.get("stable")).and_then(|s| s.as_bool()) == Some(true))
            .or_else(|| loaders.first())
            .and_then(|l| l.get("loader").and_then(|x| x.get("version")).and_then(|v| v.as_str()))
            .unwrap_or("0.15.0")
            .to_string()
    };

    let version_id = format!("fabric-loader-{}-{}", loader, mc_version);

    let profile_url = format!("https://meta.fabricmc.net/v2/versions/loader/{}/{}/profile/json", mc_version, loader);
    let res = rt.block_on(client.get(&profile_url).send()).map_err(|e| e.to_string())?;
    let profile: serde_json::Value = rt.block_on(res.json()).map_err(|e| e.to_string())?;

    let version_dir = std::path::PathBuf::from("versions").join(&version_id);
    std::fs::create_dir_all(&version_dir).ok();
    if let Ok(json) = serde_json::to_string_pretty(&profile) {
        std::fs::write(version_dir.join(format!("{}.json", version_id)), json).ok();
    }

    Ok(serde_json::json!({
        "versionId": version_id,
        "loaderVersion": loader,
        "profile": profile
    }))
}

#[tauri::command]
fn import_mrpack() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({"name": "Imported Modpack", "mcVersion": "1.21.1"}))
}

#[tauri::command]
fn cosmetic_sync_get(player_name: String, player_uuid: String) -> Result<serde_json::Value, String> {
    // Return cosmetic data for the player
    Ok(serde_json::json!({
        "equippedBadge": "badge-north",
        "equippedCape": "cape-classic",
        "ownedCosmetics": ["badge-north", "cape-classic"],
        "shards": 0,
        "playerName": player_name,
        "playerUuid": player_uuid
    }))
}

#[tauri::command]
async fn launch_game(instance_id: String, state: tauri::State<'_, AppState>) -> Result<serde_json::Value, String> {
    // Get instance
    let instance = {
        let instances = state.instances.lock().unwrap();
        instances.iter().find(|i| i.id == instance_id).cloned()
    };
    let instance = instance.ok_or_else(|| format!("Instance not found: {}", instance_id))?;

    // Get Java path
    let java_list = state.java.lock().unwrap().clone();
    let java_path = java_list.first().cloned().unwrap_or_default();
    if java_path.is_empty() {
        return Err("No Java runtime found. Please install Java or set a custom path in settings.".to_string());
    }

    // Get settings
    let settings = state.settings.lock().unwrap().clone();
    let mirror_cache = settings.mirror_vanilla_cache;

    // Get account
    let account = state.accounts.lock().unwrap().iter().find(|a| a.active).cloned();
    let account_name = account.as_ref().map(|a| a.name.clone()).unwrap_or_else(|| "Player".to_string());
    let account_uuid = account.as_ref().and_then(|a| a.uuid.clone()).unwrap_or_else(|| "00000000-0000-0000-0000-000000000000".to_string());
    let access_token = account.as_ref().and_then(|a| a.access_token.clone()).unwrap_or_default();
    let user_type = if account.as_ref().map(|a| a.account_type.as_str()) == Some("microsoft") { "msa" } else { "legacy" };

    // Install game
    let installer = crate::installer::Installer::new(crate::installer::InstallerPaths {
        versions: state.data_dir.join("versions"),
        libraries: state.data_dir.join("libraries"),
        assets: state.data_dir.join("assets"),
        meta: state.data_dir.join("meta"),
    });
    let installed = installer.install(&instance.mc_version, &instance.loader, instance.loader_version.as_deref(), mirror_cache).await
        .map_err(|e| e.to_string())?;

    // Extract natives
    let instance_dir = state.data_dir.join(&instance.id);
    let natives_dir = instance_dir.join("natives");
    std::fs::create_dir_all(&natives_dir).ok();
    installer.extract_natives(&installed.natives, &natives_dir).await.map_err(|e| e.to_string())?;

    // Build classpath string
    let cp_sep = if cfg!(target_os = "windows") { ";" } else { ":" };
    let classpath = installed.classpath.join(cp_sep);

    // Build arguments
    let args = crate::launch::LaunchService::build_arguments(
        &instance,
        installed.java_major,
        &classpath,
        &installed.asset_index_id,
        &natives_dir.to_string_lossy(),
        &account_name,
        &account_uuid,
        &access_token,
        user_type,
    );

    // Launch
    let child = crate::launch::LaunchService::launch(&java_path, &args, &instance_dir.to_string_lossy())
        .map_err(|e| e.to_string())?;

    let pid = child.id();
    *state.launch_state.lock().unwrap() = crate::models::LaunchState {
        instance_id: Some(instance_id.clone()),
        status: "running".to_string(),
        message: Some(format!("Running on Java {}", java_path)),
        pid: Some(pid),
        started_at: Some(chrono::Utc::now().timestamp_millis()),
        exit_code: None,
    };

    Ok(serde_json::json!({
        "status": "running",
        "pid": pid,
        "message": format!("Running on Java {}", java_path)
    }))
}

#[tauri::command]
fn stop_game(state: tauri::State<'_, AppState>) -> Result<(), String> {
    *state.launch_state.lock().unwrap() = crate::models::LaunchState {
        instance_id: None,
        status: "idle".to_string(),
        message: None,
        pid: None,
        started_at: None,
        exit_code: None,
    };
    Ok(())
}

#[tauri::command]
async fn update_instance(id: String, patch: serde_json::Value, state: tauri::State<'_, AppState>) -> Result<Instance, String> {
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
