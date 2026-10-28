use crate::models::InstalledMod;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

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
    downloader: Option<crate::http::Downloader>,
}

impl ModsService {
    pub fn new(instances_dir: PathBuf) -> Self {
        Self {
            instances_dir,
            downloader: Some(crate::http::Downloader::new()),
        }
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

    pub async fn install(&self, instance_id: &str, ref_str: &str) -> ModInstallResult {
        // Simplified install - just create a placeholder result
        // Full implementation would:
        // 1. Fetch project from Modrinth
        // 2. Fetch versions
        // 3. Pick best version
        // 4. Download file
        // 5. Save to mods directory
        // 6. Update mod index
        ModInstallResult {
            installed: vec![],
            skipped: vec![],
            unsupported: vec![],
            failed: vec![],
            dependencies: vec![],
        }
    }

    pub fn toggle(&self, instance_id: &str, filename: &str) -> Result<(), String> {
        let mods_dir = self.mods_dir(instance_id);
        let enabled_path = mods_dir.join(filename);
        let disabled_path = mods_dir.join(format!("{}.disabled", filename));

        if enabled_path.exists() {
            // Disable
            std::fs::rename(&enabled_path, &disabled_path)
                .map_err(|e| format!("Failed to disable mod: {}", e))?;
        } else if disabled_path.exists() {
            // Enable
            std::fs::rename(&disabled_path, &enabled_path)
                .map_err(|e| format!("Failed to enable mod: {}", e))?;
        } else {
            return Err(format!("Mod file not found: {}", filename));
        }
        Ok(())
    }

    pub fn remove(&self, instance_id: &str, identifier: &str) -> Result<(), String> {
        let mods_dir = self.mods_dir(instance_id);
        let index = self.load_index(instance_id);
        // Find the mod in the index
        if let Some(mod_entry) = index.iter().find(|m| m.project_id == identifier || m.slug == identifier) {
            let enabled_path = mods_dir.join(&mod_entry.filename);
            let disabled_path = mods_dir.join(format!("{}.disabled", mod_entry.filename));
            if enabled_path.exists() {
                std::fs::remove_file(&enabled_path).ok();
            }
            if disabled_path.exists() {
                std::fs::remove_file(&disabled_path).ok();
            }
            // Update index
            let mut new_index = index;
            new_index.retain(|m| m.project_id != identifier && m.slug != identifier);
            self.save_index(instance_id, &new_index)?;
        }
        Ok(())
    }
}