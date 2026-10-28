use crate::accounts::AccountStore;
use crate::cosmetics::CosmeticsService;
use crate::http::Downloader;
use crate::instances::InstanceStore;
use crate::modrinth::ModrinthClient;
use crate::models::*;
use crate::settings::SettingsStore;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct AppState {
    pub settings: Mutex<Settings>,
    pub settings_store: Mutex<SettingsStore>,
    pub instances: Mutex<Vec<Instance>>,
    pub instance_store: Mutex<InstanceStore>,
    pub accounts: Mutex<Vec<Account>>,
    pub account_store: Mutex<AccountStore>,
    pub modrinth: Mutex<ModrinthClient>,
    pub downloader: Mutex<Downloader>,
    pub active_account_id: Mutex<Option<String>>,
    pub hardware: Mutex<HardwareInfo>,
    pub java: Mutex<Vec<String>>,
    pub launch_state: Mutex<LaunchState>,
    pub latest_version: Mutex<Option<String>>,
    pub update_info: Mutex<UpdateInfo>,
    pub cosmetics: Mutex<CosmeticsService>,
    pub data_dir: PathBuf,
    pub initialized: Mutex<bool>,
}

impl AppState {
    pub fn new(data_dir: PathBuf, settings_store: SettingsStore, instance_store: InstanceStore, account_store: AccountStore) -> Self {
        Self {
            settings: Mutex::new(Settings::default()),
            settings_store: Mutex::new(settings_store),
            instances: Mutex::new(Vec::new()),
            instance_store: Mutex::new(instance_store),
            accounts: Mutex::new(Vec::new()),
            account_store: Mutex::new(account_store),
            cosmetics: Mutex::new(CosmeticsService::new(data_dir.join("cosmetics.json"))),
            modrinth: Mutex::new(ModrinthClient::new()),
            downloader: Mutex::new(Downloader::new()),
            active_account_id: Mutex::new(None),
            hardware: Mutex::new(HardwareInfo {
                cpu: "Unknown".to_string(),
                threads: 4,
                physical_cores: 2,
                ram_gb: 8.0,
                gpu: "Unknown".to_string(),
                gpu_vendor: "Unknown".to_string(),
                os: "Windows".to_string(),
                arch: "x64".to_string(),
                tier: "mainstream".to_string(),
                recommended_memory_mb: 4096,
                java: Vec::new(),
                detected_at: 0,
            }),
            java: Mutex::new(Vec::new()),
            launch_state: Mutex::new(LaunchState {
                instance_id: None,
                status: "idle".to_string(),
            }),
            latest_version: Mutex::new(None),
            update_info: Mutex::new(UpdateInfo {
                has_update: false,
                current_version: env!("CARGO_PKG_VERSION").to_string(),
                latest_version: env!("CARGO_PKG_VERSION").to_string(),
                download_url: String::new(),
                published_at: String::new(),
                release_notes: None,
            }),
            data_dir,
            initialized: Mutex::new(false),
        }
    }
}