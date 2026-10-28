use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CosmeticSync {
    pub equipped_badge: String,
    pub equipped_cape: String,
    pub owned_cosmetics: Vec<String>,
    pub shards: u32,
    pub player_name: String,
    pub player_uuid: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CosmeticSyncRequest {
    pub player_name: String,
    pub player_uuid: String,
    pub instance_id: String,
}

pub struct CosmeticSyncService {
    // In-memory cache of cosmetic data per player
    cache: HashMap<String, CosmeticSync>,
}

impl CosmeticSyncService {
    pub fn new() -> Self {
        Self {
            cache: HashMap::new(),
        }
    }

    pub fn get_cosmetics(&self, player_name: &str) -> Option<CosmeticSync> {
        self.cache.get(player_name).cloned()
    }

    pub fn set_cosmetics(&mut self, sync: CosmeticSync) {
        self.cache.insert(sync.player_name.clone(), sync);
    }

    pub fn sync_for_instance(&self, instance_id: &str, player_name: &str, player_uuid: &str) -> CosmeticSync {
        // Return cached or default
        self.cache.get(player_name).cloned().unwrap_or_else(|| CosmeticSync {
            equipped_badge: "badge-north".to_string(),
            equipped_cape: "cape-classic".to_string(),
            owned_cosmetics: vec!["badge-north".to_string(), "cape-classic".to_string()],
            shards: 0,
            player_name: player_name.to_string(),
            player_uuid: player_uuid.to_string(),
        })
    }
}