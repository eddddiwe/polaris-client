use crate::models::Instance;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub struct InstanceStore {
    instances_dir: PathBuf,
}

impl InstanceStore {
    pub fn new(instances_dir: PathBuf) -> Self {
        Self { instances_dir }
    }

    pub fn dir(&self, id: &str) -> PathBuf {
        self.instances_dir.join(id)
    }

    pub fn config_path(&self, id: &str) -> PathBuf {
        self.dir(id).join("instance.json")
    }

    pub async fn list(&self) -> Result<Vec<Instance>, String> {
        let mut instances = Vec::new();
        if !self.instances_dir.exists() {
            return Ok(instances);
        }
        let entries = fs::read_dir(&self.instances_dir)
            .map_err(|e| format!("Failed to read instances dir: {}", e))?;
        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
            let path = entry.path();
            if !path.is_dir() { continue; }
            let id = entry.file_name().to_string_lossy().to_string();
            if let Ok(config) = self.get(&id).await {
                instances.push(config);
            }
        }
        instances.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        Ok(instances)
    }

    pub async fn get(&self, id: &str) -> Result<Instance, String> {
        let path = self.config_path(id);
        if !path.exists() {
            return Err(format!("Instance not found: {}", id));
        }
        let content = fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read instance: {}", e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse instance: {}", e))
    }

    pub async fn create(&self, name: String, mc_version: String, loader: String) -> Result<Instance, String> {
        let id = format!("{}-{}", name.to_lowercase().replace(' ', "-").chars().take(24).collect::<String>(), &Uuid::new_v4().to_string()[..6]);
        let config = Instance {
            id: id.clone(),
            name: if name.trim().is_empty() { "New instance".to_string() } else { name.trim().to_string() },
            mc_version,
            loader,
            loader_version: None,
            kind: "game".to_string(),
            created_at: chrono::Utc::now().timestamp_millis(),
            playtime_ms: 0,
            memory_mb: 4096,
            perf_profile: "balanced".to_string(),
            jvm_preset: "aikar".to_string(),
            custom_jvm_args: String::new(),
            width: 1280,
            height: 720,
            fullscreen: false,
            extra_game_args: String::new(),
            packs: vec!["performance".to_string(), "qol".to_string()],
            auto_update: true,
            accent: "#7c5cff".to_string(),
            notes: String::new(),
            icon: None,
            port: None,
            eula_accepted: None,
            mod_count: 0,
            running: false,
            installed: false,
            disk_bytes: 0,
        };
        let dir = self.dir(&id);
        fs::create_dir_all(&dir).map_err(|e| format!("Failed to create instance dir: {}", e))?;
        for folder in ["mods", "config", "logs", "saves", "resourcepacks", "shaderpacks", "screenshots", "natives"] {
            fs::create_dir_all(dir.join(folder)).map_err(|e| format!("Failed to create folder: {}", e))?;
        }
        // Write servers.dat with CobbleClash server
        let _ = crate::nbt::ensure_servers_dat(&dir);
        let config_path = self.config_path(&id);
        let json = serde_json::to_string_pretty(&config)
            .map_err(|e| format!("Failed to serialize instance: {}", e))?;
        fs::write(&config_path, json)
            .map_err(|e| format!("Failed to write instance config: {}", e))?;
        Ok(config)
    }

    pub async fn update(&self, id: &str, patch: serde_json::Value) -> Result<Instance, String> {
        let current = self.get(id).await?;
        let mut next = current.clone();
        if let Some(name) = patch.get("name").and_then(|v| v.as_str()) {
            next.name = name.to_string();
        }
        if let Some(mc_version) = patch.get("mcVersion").and_then(|v| v.as_str()) {
            next.mc_version = mc_version.to_string();
        }
        if let Some(loader) = patch.get("loader").and_then(|v| v.as_str()) {
            next.loader = loader.to_string();
        }
        if let Some(loader_version) = patch.get("loaderVersion").and_then(|v| v.as_str()) {
            next.loader_version = Some(loader_version.to_string());
        }
        if let Some(memory_mb) = patch.get("memoryMb").and_then(|v| v.as_u64()) {
            next.memory_mb = memory_mb as u32;
        }
        if let Some(notes) = patch.get("notes").and_then(|v| v.as_str()) {
            next.notes = notes.to_string();
        }
        let config_path = self.config_path(id);
        let json = serde_json::to_string_pretty(&next)
            .map_err(|e| format!("Failed to serialize instance: {}", e))?;
        fs::write(&config_path, json)
            .map_err(|e| format!("Failed to write instance config: {}", e))?;
        Ok(next)
    }

    pub async fn remove(&self, id: &str) -> Result<(), String> {
        let dir = self.dir(id);
        if dir.exists() {
            fs::remove_dir_all(&dir)
                .map_err(|e| format!("Failed to remove instance: {}", e))?;
        }
        Ok(())
    }

    pub async fn list_ids(&self) -> Result<Vec<String>, String> {
        let mut ids = Vec::new();
        if !self.instances_dir.exists() {
            return Ok(ids);
        }
        let entries = fs::read_dir(&self.instances_dir)
            .map_err(|e| format!("Failed to read instances dir: {}", e))?;
        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
            if entry.path().is_dir() {
                ids.push(entry.file_name().to_string_lossy().to_string());
            }
        }
        Ok(ids)
    }
}