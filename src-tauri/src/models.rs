use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Instance {
    pub id: String,
    pub name: String,
    pub mc_version: String,
    pub loader: String,
    pub loader_version: Option<String>,
    pub kind: String,
    pub created_at: i64,
    pub playtime_ms: i64,
    pub memory_mb: u32,
    pub perf_profile: String,
    pub jvm_preset: String,
    pub custom_jvm_args: String,
    pub width: u32,
    pub height: u32,
    pub fullscreen: bool,
    pub extra_game_args: String,
    pub packs: Vec<String>,
    pub auto_update: bool,
    pub accent: String,
    pub notes: String,
    pub icon: Option<String>,
    pub port: Option<u32>,
    pub eula_accepted: Option<bool>,
    pub mod_count: u32,
    pub running: bool,
    pub installed: bool,
    pub disk_bytes: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Settings {
    pub data_dir: String,
    pub java_path: String,
    pub memory_mb: u32,
    pub ms_client_id: String,
    pub close_launcher_on_play: bool,
    pub auto_update_mods: bool,
    pub lower_launcher_priority: bool,
    pub wallpaper: String,
    pub wallpaper_url: String,
    pub shards: u32,
    pub shards_claimed_ms: i64,
    pub owned_cosmetics: Vec<String>,
    pub equipped_badge: String,
    pub equipped_cape: String,
    pub ms_client_id_custom: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            data_dir: String::new(),
            java_path: String::new(),
            memory_mb: 4096,
            ms_client_id: "09aa1d05-9369-4725-bdb8-a46e54149e71".to_string(),
            close_launcher_on_play: true,
            auto_update_mods: true,
            lower_launcher_priority: false,
            wallpaper: "none".to_string(),
            wallpaper_url: String::new(),
            shards: 900,
            shards_claimed_ms: 0,
            owned_cosmetics: vec![],
            equipped_badge: "badge-north".to_string(),
            equipped_cape: "cape-classic".to_string(),
            ms_client_id_custom: false,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HardwareInfo {
    pub cpu: String,
    pub threads: u32,
    pub physical_cores: u32,
    pub ram_gb: f64,
    pub gpu: String,
    pub gpu_vendor: String,
    pub os: String,
    pub arch: String,
    pub tier: String,
    pub recommended_memory_mb: u32,
    pub java: Vec<String>,
    pub detected_at: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Bootstrap {
    pub app_version: String,
    pub settings: Settings,
    pub instances: Vec<Instance>,
    pub accounts: Vec<Account>,
    pub active_account_id: Option<String>,
    pub hardware: HardwareInfo,
    pub launch: LaunchState,
    pub java: Vec<JavaInfo>,
    pub data_dir: String,
    pub packs: Vec<Pack>,
    pub latest_version: Option<String>,
    pub update_info: UpdateInfo,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Account {
    pub id: String,
    pub name: String,
    pub account_type: String,
    pub uuid: Option<String>,
    pub skin_url: Option<String>,
    pub active: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LaunchState {
    pub instance_id: Option<String>,
    pub status: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct JavaInfo {
    pub path: String,
    pub version: String,
    pub major: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Pack {
    pub id: String,
    pub name: String,
    pub tagline: String,
    pub color: String,
    pub recommended: bool,
    pub target: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct UpdateInfo {
    pub has_update: bool,
    pub current_version: String,
    pub latest_version: String,
    pub release_notes: Option<String>,
    pub download_url: String,
    pub published_at: String,
}