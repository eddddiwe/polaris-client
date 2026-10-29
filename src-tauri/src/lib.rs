mod accounts;
mod auth;
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
        .plugin(tauri_plugin_dialog::init())
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
            accounts_microsoft,
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
            gameui_get,
            gameui_apply,
            perf_scan,
            perf_plan,
            perf_apply,
            instance_get,
            versions_list,
            settings_snapshot,
            settings_rescan_java,
            settings_choose_java,
            open_instance_folder,
            open_logs,
            launch_tail,
            launch_start,
            launch_stop,
            search_mods,
            mod_detail,
            mod_versions,
            install_mod,
            list_mods,
            mods_remove,
            mods_toggle,
            mods_updates,
            mods_update_all,
            mods_install_version,
            mods_categories,
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
    let account_store = state.account_store.lock().unwrap();
    Ok(account_store.list())
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
async fn accounts_microsoft(app: tauri::AppHandle, state: tauri::State<'_, AppState>) -> Result<serde_json::Value, String> {
    let client_id = state.settings.lock().unwrap().ms_client_id.clone();
    let store = crate::accounts::AccountStore::new(state.data_dir.join("accounts.json"));
    let auth = crate::auth::AuthService::new(store);
    let emitter = crate::events::EventEmitter::new(app);
    let info = auth.begin_device_login(client_id, emitter).await?;
    Ok(serde_json::to_value(info).unwrap_or_default())
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
async fn import_mrpack(app: tauri::AppHandle, state: tauri::State<'_, AppState>) -> Result<serde_json::Value, String> {
    use tauri_plugin_dialog::DialogExt;
    // File dialog
    let file = app.dialog().file().add_filter("Modpack", &["mrpack"]).blocking_pick_file();
    let path = match file {
        Some(p) => p.to_string(),
        None => return Err("No file selected".to_string()),
    };

    // Read zip and parse index
    let mut zip = zip::ZipArchive::new(std::fs::File::open(&path).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    let mut index_content = String::new();
    {
        let mut entry = zip.by_name("modrinth.index.json").map_err(|e| format!("Missing modrinth.index.json: {}", e))?;
        std::io::Read::read_to_string(&mut entry, &mut index_content).map_err(|e| e.to_string())?;
    }

    let plan = crate::modpacks::ModpackService::parse_index(&index_content, None)
        .map_err(|e| e.to_string())?;

    // Create instance
    let rt = tokio::runtime::Runtime::new().unwrap();
    let (config, instance_id_for_update) = {
        let instance_store = state.instance_store.lock().unwrap();
        let config = rt.block_on(instance_store.create(
            plan.name.clone(),
            plan.mc_version.clone(),
            plan.loader.clone(),
        )).map_err(|e| e)?;
        // Set loader version if fabric
        if plan.loader == "fabric" {
            if let Some(lv) = &plan.loader_version {
                let _ = rt.block_on(instance_store.update(&config.id, serde_json::json!({"loaderVersion": lv})));
            }
        }
        (config.clone(), config.id.clone())
    };
    // Update in-memory instances
    {
        let mut instances = state.instances.lock().unwrap();
        let store = state.instance_store.lock().unwrap();
        let updated = rt.block_on(store.get(&config.id)).unwrap_or(config.clone());
        drop(store);
        instances.push(updated.clone());
    }

    let instance_id = config.id.clone();
    // Populate (download mods + extract overrides)
    let modpack_service = crate::modpacks::ModpackService::new(state.data_dir.join("instances"));
    let result = modpack_service.populate(&instance_id, &path, &plan, true).await
        .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "name": plan.name,
        "mcVersion": plan.mc_version,
        "loader": plan.loader,
        "loaderVersion": plan.loader_version,
        "instanceId": instance_id,
        "filesInstalled": result.files_installed,
        "filesSkipped": result.files_skipped,
        "overridesExtracted": result.overrides_extracted,
        "status": "imported"
    }))
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
async fn launch_start(instance_id: String, state: tauri::State<'_, AppState>) -> Result<serde_json::Value, String> {
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

    // Get account (read from disk to get latest, including refreshed tokens)
    let disk_accounts = {
        let account_store = state.account_store.lock().unwrap();
        account_store.list()
    };
    let mut account = disk_accounts.into_iter().find(|a| a.active);
    // Refresh Microsoft token if needed
    if let Some(acc) = &account {
        if acc.account_type == "microsoft" {
            let store = crate::accounts::AccountStore::new(state.data_dir.join("accounts.json"));
            let auth = crate::auth::AuthService::new(store);
            if let Ok(refreshed) = auth.refresh_if_needed(acc).await {
                // Update in-memory
                let mut accounts = state.accounts.lock().unwrap();
                if let Some(idx) = accounts.iter().position(|a| a.id == refreshed.id) {
                    accounts[idx] = refreshed.clone();
                }
                account = Some(refreshed);
            }
        }
    }
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
fn launch_stop(state: tauri::State<'_, AppState>) -> Result<(), String> {
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
async fn instance_get(id: String, state: tauri::State<'_, AppState>) -> Result<serde_json::Value, String> {
    let instance_store = state.instance_store.lock().unwrap();
    let rt = tokio::runtime::Runtime::new().unwrap();
    let instance = rt.block_on(instance_store.get(&id)).map_err(|e| e)?;
    drop(instance_store);

    // Check installed status: version json exists
    let version_path = state.data_dir.join("versions").join(&instance.mc_version).join(format!("{}.json", instance.mc_version));
    let installed = version_path.exists();

    // Load mods
    let mods_service = crate::mods::ModsService::new(state.data_dir.join("instances"));
    let mods = mods_service.list(&id);

    Ok(serde_json::json!({
        "instance": instance,
        "mods": mods,
        "installed": installed
    }))
}

#[tauri::command]
async fn versions_list(include_snapshots: bool, state: tauri::State<'_, AppState>) -> Result<Vec<serde_json::Value>, String> {
    let client = reqwest::Client::new();
    let res = client.get("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json")
        .send().await.map_err(|e| e.to_string())?;
    let manifest: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let versions = manifest.get("versions").and_then(|v| v.as_array()).ok_or("No versions")?;
    let mut out = Vec::new();
    for v in versions {
        let vtype = v.get("type").and_then(|t| t.as_str()).unwrap_or("release");
        if !include_snapshots && vtype != "release" { continue; }
        out.push(serde_json::json!({
            "id": v.get("id"),
            "type": vtype,
            "releaseTime": v.get("releaseTime"),
        }));
    }
    Ok(out)
}

#[tauri::command]
fn settings_snapshot(state: tauri::State<'_, AppState>) -> Result<Settings, String> {
    Ok(state.settings.lock().unwrap().clone())
}

#[tauri::command]
async fn settings_rescan_java(state: tauri::State<'_, AppState>) -> Result<Vec<String>, String> {
    let paths = scan_java(&[]);
    *state.java.lock().unwrap() = paths.clone();
    Ok(paths)
}

#[tauri::command]
async fn settings_choose_java(app: tauri::AppHandle, state: tauri::State<'_, AppState>) -> Result<serde_json::Value, String> {
    use tauri_plugin_dialog::DialogExt;
    let file = app.dialog().file().add_filter("Java runtime", &["exe", "*"]).blocking_pick_file();
    match file {
        Some(path) => {
            let path_str = path.to_string();
            let java = scan_java(&[path_str.clone()]);
            *state.java.lock().unwrap() = java.clone();
            // Update settings
            {
                let mut s = state.settings.lock().unwrap();
                s.java_path = path_str.clone();
            }
            // Persist
            {
                let settings = state.settings.lock().unwrap().clone();
                let store = state.settings_store.lock().unwrap();
                let _ = store.update(&settings);
            }
            Ok(serde_json::json!({"path": path_str, "java": java}))
        }
        None => Ok(serde_json::json!({"path": "", "java": state.java.lock().unwrap().clone()})),
    }
}

#[tauri::command]
async fn open_instance_folder(id: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let instance_store = state.instance_store.lock().unwrap();
    let dir = instance_store.dir(&id);
    if !dir.exists() {
        return Err("Instance not found".to_string());
    }
    #[cfg(target_os = "windows")]
    { std::process::Command::new("explorer").arg(&dir).spawn().ok(); }
    #[cfg(target_os = "macos")]
    { std::process::Command::new("open").arg(&dir).spawn().ok(); }
    #[cfg(target_os = "linux")]
    { std::process::Command::new("xdg-open").arg(&dir).spawn().ok(); }
    Ok(())
}

#[tauri::command]
async fn open_logs(id: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let instance_store = state.instance_store.lock().unwrap();
    let dir = instance_store.dir(&id).join("logs");
    std::fs::create_dir_all(&dir).ok();
    #[cfg(target_os = "windows")]
    { std::process::Command::new("explorer").arg(&dir).spawn().ok(); }
    #[cfg(target_os = "macos")]
    { std::process::Command::new("open").arg(&dir).spawn().ok(); }
    #[cfg(target_os = "linux")]
    { std::process::Command::new("xdg-open").arg(&dir).spawn().ok(); }
    Ok(())
}

#[tauri::command]
async fn launch_tail(id: String, lines: Option<u32>, state: tauri::State<'_, AppState>) -> Result<Vec<String>, String> {
    let instance_store = state.instance_store.lock().unwrap();
    let log_dir = instance_store.dir(&id).join("logs");
    let n = lines.unwrap_or(250) as usize;

    // Prefer latest.log, fall back to most recent file
    let latest = log_dir.join("latest.log");
    let path = if latest.exists() {
        latest
    } else {
        let mut log_files: Vec<_> = std::fs::read_dir(&log_dir)
            .map(|rd| rd.filter_map(|e| e.ok()).map(|e| e.path()).collect())
            .unwrap_or_default();
        log_files.sort();
        match log_files.last().cloned() {
            Some(p) => p,
            None => return Ok(Vec::new()),
        }
    };

    let content = std::fs::read_to_string(&path).unwrap_or_default();
    let all_lines: Vec<&str> = content.lines().collect();
    let start = all_lines.len().saturating_sub(n);
    Ok(all_lines[start..].iter().map(|s| s.to_string()).collect())
}
#[tauri::command]
async fn perf_scan(state: tauri::State<'_, AppState>) -> Result<serde_json::Value, String> {
    let hw = state.hardware.lock().unwrap().clone();
    Ok(serde_json::to_value(hw).unwrap_or_default())
}

#[tauri::command]
async fn perf_plan(instance_id: String, profile: String, memory_mb: Option<u32>, preset: Option<String>, state: tauri::State<'_, AppState>) -> Result<serde_json::Value, String> {
    let hw = state.hardware.lock().unwrap().clone();
    let profile = if profile.is_empty() { "balanced".to_string() } else { profile };

    // Memory
    let requested = memory_mb.unwrap_or(hw.recommended_memory_mb);
    let memory = (requested as i64).clamp(1024, 32768);
    let memory = (memory as f64 / 1.0).round() as u32;

    // JVM preset
    let jvm_preset = preset.unwrap_or_else(|| {
        if profile == "competitive" { "low-latency".to_string() } else { "aikar".to_string() }
    });

    // Java major (hardware.java is Vec<String>, skip for now)

    // Build JVM args (simplified)
    let mut jvm_args = Vec::new();
    jvm_args.push(format!("-Xms{}M", memory));
    jvm_args.push(format!("-Xmx{}M", memory));
    match jvm_preset.as_str() {
        "zgc" => {
            jvm_args.push("-XX:+UseZGC".to_string());
            jvm_args.push("-XX:+AlwaysPreTouch".to_string());
            jvm_args.push("-XX:+DisableExplicitGC".to_string());
        }
        "low-latency" => {
            jvm_args.push("-XX:+UseG1GC".to_string());
            jvm_args.push("-XX:MaxGCPauseMillis=20".to_string());
            jvm_args.push("-XX:+UseStringDeduplication".to_string());
        }
        _ => {
            jvm_args.push("-XX:+UseG1GC".to_string());
            jvm_args.push("-XX:+ParallelRefProcEnabled".to_string());
            jvm_args.push("-XX:MaxGCPauseMillis=200".to_string());
            jvm_args.push("-XX:+UnlockExperimentalVMOptions".to_string());
            jvm_args.push("-XX:+DisableExplicitGC".to_string());
            jvm_args.push("-XX:+AlwaysPreTouch".to_string());
            jvm_args.push("-XX:G1NewSizePercent=30".to_string());
            jvm_args.push("-XX:G1MaxNewSizePercent=40".to_string());
            jvm_args.push("-XX:G1HeapRegionSize=8M".to_string());
            jvm_args.push("-XX:G1ReservePercent=20".to_string());
            jvm_args.push("-XX:G1HeapWastePercent=5".to_string());
            jvm_args.push("-XX:G1MixedGCCountTarget=4".to_string());
            jvm_args.push("-XX:InitiatingHeapOccupancyPercent=15".to_string());
            jvm_args.push("-XX:G1MixedGCLiveThresholdPercent=90".to_string());
            jvm_args.push("-XX:G1RSetUpdatingPauseTimePercent=5".to_string());
            jvm_args.push("-XX:SurvivorRatio=32".to_string());
            jvm_args.push("-XX:+PerfDisableSharedMem".to_string());
            jvm_args.push("-XX:MaxTenuringThreshold=1".to_string());
            if memory >= 4096 {
                jvm_args.push("-XX:+UseStringDeduplication".to_string());
            }
        }
    }

    // Options
    let size_boost = match hw.tier.as_str() {
        "entry" => -2,
        "mainstream" => 0,
        "high" => 2,
        "enthusiast" => 4,
        _ => 0,
    };
    let render = match profile.as_str() {
        "competitive" => (4 + size_boost).max(4) as i64,
        "balanced" => (12 + size_boost).max(6) as i64,
        _ => (16 + size_boost).max(8) as i64,
    };
    let simulation = match profile.as_str() {
        "competitive" => (5 + size_boost / 2).max(4) as i64,
        "balanced" => 8,
        _ => 10,
    };
    let max_fps = match profile.as_str() {
        "competitive" => 260,
        "balanced" => 144,
        _ => 120,
    };

    let options = serde_json::json!({
        "renderDistance": render.to_string(),
        "simulationDistance": simulation.to_string(),
        "maxFps": max_fps.to_string(),
        "enableVsync": "false",
        "graphicsMode": if profile == "competitive" { "0" } else { "1" },
        "particles": if profile == "competitive" { "2" } else if profile == "balanced" { "1" } else { "0" },
        "entityShadows": if profile == "competitive" { "false" } else { "true" },
        "biomeBlendRadius": if profile == "competitive" { "0" } else if profile == "balanced" { "2" } else { "3" },
        "mipmapLevels": if profile == "competitive" { "2" } else { "4" },
        "ao": "true"
    });

    // Notes
    let mut notes = Vec::new();
    if hw.tier == "entry" { notes.push("Entry-tier GPU detected - distance is lowered to protect frame pacing.".to_string()); }
    if hw.ram_gb <= 8.0 { notes.push("8 GB system: 3 GB heap is the safe ceiling; close background apps before playing.".to_string()); }
    if profile == "competitive" { notes.push("Competitive mode minimizes particles, entity shadows and render distance for stable input latency.".to_string()); }
    if profile == "quality" { notes.push("Quality mode keeps shadows and full particles; shaders will still cost frames.".to_string()); }
    if jvm_preset == "zgc" { notes.push("Generational ZGC targets sub-millisecond pauses; it needs Java 21+ and shines on 8 GB+ heaps.".to_string()); }
    notes.push("Game must be closed when applying video settings.".to_string());

    // Score
    let base = match hw.tier.as_str() {
        "entry" => 38,
        "mainstream" => 58,
        "high" => 76,
        "enthusiast" => 88,
        _ => 50,
    };
    let thread_bonus = (hw.threads as i64 - 4).clamp(0, 8);
    let ram_bonus = if hw.ram_gb >= 16.0 { 4 } else { 0 };
    let score = (base + thread_bonus + ram_bonus).min(100);

    Ok(serde_json::json!({
        "profile": profile,
        "memoryMb": memory,
        "jvmPreset": jvm_preset,
        "jvmArgs": jvm_args,
        "options": options,
        "notes": notes,
        "score": score
    }))
}

#[tauri::command]
async fn perf_apply(instance_id: String, profile: String, memory_mb: Option<u32>, preset: Option<String>, state: tauri::State<'_, AppState>) -> Result<serde_json::Value, String> {
    // Generate plan
    let plan = perf_plan(instance_id.clone(), profile.clone(), memory_mb, preset.clone(), state.clone()).await?;

    let memory = plan.get("memoryMb").and_then(|v| v.as_u64()).unwrap_or(4096) as u32;
    let jvm_preset = plan.get("jvmPreset").and_then(|v| v.as_str()).unwrap_or("aikar").to_string();
    let options = plan.get("options").cloned().unwrap_or(serde_json::json!({}));

    // Update instance
    {
        let instance_store = state.instance_store.lock().unwrap();
        let rt = tokio::runtime::Runtime::new().unwrap();
        let _ = rt.block_on(instance_store.update(&instance_id, serde_json::json!({
            "memoryMb": memory,
            "jvmPreset": jvm_preset,
        })));
    }

    // Update in-memory
    {
        let mut instances = state.instances.lock().unwrap();
        if let Some(idx) = instances.iter().position(|i| i.id == instance_id) {
            instances[idx].memory_mb = memory;
            instances[idx].jvm_preset = jvm_preset.clone();
            instances[idx].perf_profile = profile.clone();
        }
    }

    // Apply options to options.txt
    let instance_store = state.instance_store.lock().unwrap();
    let instance_dir = instance_store.dir(&instance_id);
    drop(instance_store);
    let options_file = instance_dir.join("options.txt");

    // Read existing options
    let mut existing: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    if options_file.exists() {
        if let Ok(content) = std::fs::read_to_string(&options_file) {
            for line in content.lines() {
                if let Some(idx) = line.find(':') {
                    existing.insert(line[..idx].to_string(), line[idx+1..].to_string());
                }
            }
        }
    }

    let mut changed = 0i64;
    if let Some(obj) = options.as_object() {
        for (key, val) in obj {
            if let Some(v) = val.as_str() {
                if existing.get(key) != Some(&v.to_string()) {
                    existing.insert(key.clone(), v.to_string());
                    changed += 1;
                }
            }
        }
    }

    if changed > 0 {
        // Backup
        let backup = instance_dir.join(format!("options.txt.polaris-{}.bak", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis()));
        if options_file.exists() {
            std::fs::copy(&options_file, &backup).ok();
        }
        // Write
        let body: String = existing.iter().map(|(k, v)| format!("{}:{}", k, v)).collect::<Vec<_>>().join("\n");
        std::fs::write(&options_file, format!("{}\n", body)).ok();
    }

    Ok(serde_json::json!({
        "changed": changed,
        "memoryMb": memory,
        "jvmPreset": jvm_preset,
        "profile": profile
    }))
}

#[tauri::command]
async fn gameui_get(instance_id: String, state: tauri::State<'_, AppState>) -> Result<serde_json::Value, String> {
    let instance_store = state.instance_store.lock().unwrap();
    let instance_dir = instance_store.dir(&instance_id);
    drop(instance_store);

    let options_file = instance_dir.join("options.txt");

    // Defaults
    let mut values = serde_json::json!({
        "guiScale": 0,
        "fov": 70.0,
        "gamma": 0.5,
        "chatOpacity": 1.0,
        "chatScale": 1.0,
        "screenEffectScale": 1.0,
        "attackIndicator": 1
    });

    let mut source = "defaults".to_string();

    if options_file.exists() {
        if let Ok(content) = std::fs::read_to_string(&options_file) {
            let mut parsed: std::collections::HashMap<String, String> = std::collections::HashMap::new();
            for line in content.lines() {
                if let Some(idx) = line.find(':') {
                    parsed.insert(line[..idx].to_string(), line[idx+1..].to_string());
                }
            }
            let read_num = |key: &str, default: f64| -> f64 {
                parsed.get(key).and_then(|v| v.parse().ok()).unwrap_or(default)
            };
            values = serde_json::json!({
                "guiScale": read_num("guiScale", 0.0).round() as i64,
                "fov": read_num("fov", 70.0).round() as i64,
                "gamma": (read_num("gamma", 0.5) * 100.0).round() / 100.0,
                "chatOpacity": (read_num("chatOpacity", 1.0) * 100.0).round() / 100.0,
                "chatScale": (read_num("chatScale", 1.0) * 100.0).round() / 100.0,
                "screenEffectScale": (read_num("screenEffectScale", 1.0) * 100.0).round() / 100.0,
                "attackIndicator": read_num("attackIndicator", 1.0).round() as i64,
            });
            source = "options.txt".to_string();
        }
    }

    Ok(serde_json::json!({
        "values": values,
        "source": source
    }))
}

#[tauri::command]
async fn gameui_apply(instance_id: String, values: serde_json::Value, state: tauri::State<'_, AppState>) -> Result<serde_json::Value, String> {
    let instance_store = state.instance_store.lock().unwrap();
    let instance_dir = instance_store.dir(&instance_id);
    drop(instance_store);

    // Check if running
    let launch_state = state.launch_state.lock().unwrap();
    if launch_state.status == "running" && launch_state.instance_id.as_deref() == Some(&instance_id) {
        return Err("Close Minecraft before changing interface options.".to_string());
    }
    drop(launch_state);

    let options_file = instance_dir.join("options.txt");

    // Normalize values
    let gui_scale = values.get("guiScale").and_then(|v| v.as_f64()).unwrap_or(0.0).round().clamp(0.0, 4.0) as i64;
    let fov = values.get("fov").and_then(|v| v.as_f64()).unwrap_or(70.0).round().clamp(30.0, 110.0);
    let gamma = values.get("gamma").and_then(|v| v.as_f64()).unwrap_or(0.5).clamp(0.0, 1.0);
    let chat_opacity = values.get("chatOpacity").and_then(|v| v.as_f64()).unwrap_or(1.0).clamp(0.0, 1.0);
    let chat_scale = values.get("chatScale").and_then(|v| v.as_f64()).unwrap_or(1.0).clamp(0.0, 1.0);
    let screen_effect = values.get("screenEffectScale").and_then(|v| v.as_f64()).unwrap_or(1.0).clamp(0.0, 1.0);
    let attack_indicator = values.get("attackIndicator").and_then(|v| v.as_f64()).unwrap_or(1.0).round().clamp(0.0, 2.0) as i64;

    // Read existing
    let mut existing: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    if options_file.exists() {
        if let Ok(content) = std::fs::read_to_string(&options_file) {
            for line in content.lines() {
                if let Some(idx) = line.find(':') {
                    existing.insert(line[..idx].to_string(), line[idx+1..].to_string());
                }
            }
        }
    }

    // Apply
    let new_values = [
        ("guiScale", gui_scale.to_string()),
        ("fov", format!("{:.1}", fov)),
        ("gamma", format!("{:.2}", gamma)),
        ("chatOpacity", format!("{:.2}", chat_opacity)),
        ("chatScale", format!("{:.2}", chat_scale)),
        ("screenEffectScale", format!("{:.2}", screen_effect)),
        ("attackIndicator", attack_indicator.to_string()),
    ];

    let mut changed = 0i64;
    for (key, val) in &new_values {
        if existing.get(*key) != Some(val) {
            existing.insert(key.to_string(), val.clone());
            changed += 1;
        }
    }

    if changed > 0 {
        // Backup
        let backup = instance_dir.join(format!("options.txt.polaris-{}.bak", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis()));
        if options_file.exists() {
            std::fs::copy(&options_file, &backup).ok();
        }
        let body: String = existing.iter().map(|(k, v)| format!("{}:{}", k, v)).collect::<Vec<_>>().join("\n");
        std::fs::write(&options_file, format!("{}\n", body)).ok();
    }

    let result_values = serde_json::json!({
        "guiScale": gui_scale,
        "fov": fov,
        "gamma": (gamma * 100.0).round() / 100.0,
        "chatOpacity": (chat_opacity * 100.0).round() / 100.0,
        "chatScale": (chat_scale * 100.0).round() / 100.0,
        "screenEffectScale": (screen_effect * 100.0).round() / 100.0,
        "attackIndicator": attack_indicator,
    });

    Ok(serde_json::json!({
        "values": result_values,
        "changed": changed,
    }))
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
