use crate::models::Account;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

pub struct AccountStore {
    path: PathBuf,
}

impl AccountStore {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    pub fn list(&self) -> Vec<Account> {
        self.load().unwrap_or_default()
    }

    pub fn load(&self) -> Result<Vec<Account>, String> {
        if !self.path.exists() {
            return Ok(Vec::new());
        }
        let content = fs::read_to_string(&self.path)
            .map_err(|e| format!("Failed to read accounts: {}", e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse accounts: {}", e))
    }

    pub fn save(&self, accounts: &[Account]) -> Result<(), String> {
        let json = serde_json::to_string_pretty(accounts)
            .map_err(|e| format!("Failed to serialize accounts: {}", e))?;
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).ok();
        }
        fs::write(&self.path, json)
            .map_err(|e| format!("Failed to write accounts: {}", e))?;
        Ok(())
    }

    pub fn add_offline(&self, name: &str) -> Result<Account, String> {
        let clean = name.trim();
        if !clean.chars().all(|c| c.is_alphanumeric() || c == '_') || clean.len() < 3 || clean.len() > 16 {
            return Err("Username must be 3-16 characters: letters, numbers or underscore.".to_string());
        }
        let account = Account {
            id: format!("offline:{}", clean.to_lowercase()),
            name: clean.to_string(),
            account_type: "offline".to_string(),
            uuid: None,
            skin_url: None,
            active: true,
            access_token: None,
            refresh_token: None,
            expires_at: None,
            client_id: None,
            xuid: None,
        };
        let mut accounts = self.load().unwrap_or_default();
        // Deactivate all others
        for a in &mut accounts {
            a.active = false;
        }
        accounts.push(account.clone());
        self.save(&accounts)?;
        Ok(account)
    }

    pub fn active(&self) -> Option<Account> {
        self.load().ok().and_then(|accounts| accounts.into_iter().find(|a| a.active))
    }

    pub fn remove(&self, id: &str) -> Result<(), String> {
        let mut accounts = self.load().unwrap_or_default();
        accounts.retain(|a| a.id != id);
        self.save(&accounts)?;
        Ok(())
    }

    pub fn set_active(&self, id: &str) -> Result<(), String> {
        let mut accounts = self.load().unwrap_or_default();
        for a in &mut accounts {
            a.active = a.id == id;
        }
        self.save(&accounts)?;
        Ok(())
    }
}