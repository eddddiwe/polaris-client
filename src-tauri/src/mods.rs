use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct InstalledMod {
    pub project_id: String,
    pub slug: String,
    pub name: String,
    pub version_id: String,
    pub version_number: String,
    pub filename: String,
    pub size: u64,
    pub enabled: bool,
    pub source: String,
    pub icon_url: Option<String>,
    pub has_update: Option<bool>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ModInstallResult {
    pub installed: Vec<String>,
    pub skipped: Vec<String>,
    pub unsupported: Vec<String>,
    pub failed: Vec<ModFailure>,
    pub dependencies: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ModFailure {
    pub name: String,
    pub error: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ModUpdateInfo {
    pub project_id: String,
    pub slug: String,
    pub name: String,
    pub current_version: String,
    pub new_version_number: String,
    pub new_version_id: String,
}

pub struct ModsService {
    instances_dir: PathBuf,
    // In a full implementation, this would hold:
    // - downloader: Downloader
    // - modrinth: ModrinthClient
    // - logger: Logger
}

impl ModsService {
    pub fn new(instances_dir: PathBuf) -> Self {
        Self { instances_dir }
    }

    fn mods_dir(&self, instance_id: &str) -> PathBuf {
        self.instances_dir.join(instance_id).join("mods")
    }

    fn index_path(&self, instance_id: &str) -> PathBuf {
        self.mods_dir(instance_id).join(".polaris-index.json")
    }

    pub fn list(&self, instance_id: &str) -> Vec<InstalledMod> {
        let index_path = self.index_path(instance_id);
        if !index_path.exists() {
            return Vec::new();
        }
        let content = match fs::read_to_string(&index_path) {
            Ok(c) => c,
            Err(_) => return Vec::new(),
        };
        let index: serde_json::Value = match serde_json::from_str(&content) {
            Ok(v) => v,
            Err(_) => return Vec::new(),
        };
        let mods = index.get("mods").and_then(|m| m.as_array()).cloned().unwrap_or_default();
        mods.into_iter().filter_map(|m| serde_json::from_value(m).ok()).collect()
    }

    pub fn load_index(&self, instance_id: &str) -> Vec<InstalledMod> {
        self.list(instance_id)
    }

    pub fn save_index(&self, instance_id: &str, mods: &[InstalledMod]) -> Result<(), String> {
        let index = serde_json::json!({ "version": 1, "mods": mods });
        let json = serde_json::to_string_pretty(&index)
            .map_err(|e| format!("Failed to serialize mod index: {}", e))?;
        let path = self.index_path(instance_id);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).ok();
        }
        fs::write(&path, json)
            .map_err(|e| format!("Failed to write mod index: {}", e))?;
        Ok(())
    }

    pub fn mods_dir_path(&self, instance_id: &str) -> PathBuf {
        self.mods_dir(instance_id)
    }
}