use crate::models::Settings;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

pub struct SettingsStore {
    path: PathBuf,
}

impl SettingsStore {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    pub fn get(&self) -> Settings {
        self.load().unwrap_or_default()
    }

    pub fn load(&self) -> Result<Settings, String> {
        if !self.path.exists() {
            return Ok(Settings::default());
        }
        let content = fs::read_to_string(&self.path)
            .map_err(|e| format!("Failed to read settings: {}", e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse settings: {}", e))
    }

    pub fn update(&self, patch: &Settings) -> Result<Settings, String> {
        // For simplicity, just save the whole settings
        let json = serde_json::to_string_pretty(patch)
            .map_err(|e| format!("Failed to serialize settings: {}", e))?;
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).ok();
        }
        fs::write(&self.path, json)
            .map_err(|e| format!("Failed to write settings: {}", e))?;
        Ok(patch.clone())
    }
}