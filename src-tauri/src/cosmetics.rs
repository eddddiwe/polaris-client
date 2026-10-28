use crate::models::*;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CosmeticItem {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub tagline: String,
    pub rarity: String,
    pub price: u32,
    pub glyph: Option<String>,
    pub colors: Vec<String>,
    pub pattern: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct CosmeticSnapshot {
    pub items: Vec<CosmeticItem>,
    pub owned: Vec<String>,
    pub equipped_badge: String,
    pub equipped_cape: String,
    pub shards: u32,
    pub total_playtime_ms: i64,
    pub claimable: u32,
}

pub struct CosmeticsService {
    path: PathBuf,
    items: Vec<CosmeticItem>,
}

impl CosmeticsService {
    pub fn new(path: PathBuf) -> Self {
        // Default cosmetic catalog
        let items = vec![
            CosmeticItem { id: "badge-north".to_string(), name: "North Star".to_string(), kind: "badge".to_string(), tagline: "The mark of every Polaris pilot.".to_string(), rarity: "common".to_string(), price: 0, glyph: Some("star".to_string()), colors: vec!["#c4b5fd".to_string(), "#7c3aed".to_string()], pattern: None },
            CosmeticItem { id: "badge-comet".to_string(), name: "Comet".to_string(), kind: "badge".to_string(), tagline: "Built for quick sessions and quick reflexes.".to_string(), rarity: "rare".to_string(), price: 450, glyph: Some("comet".to_string()), colors: vec!["#67e8f9".to_string(), "#2563eb".to_string()], pattern: None },
            CosmeticItem { id: "badge-ember".to_string(), name: "Ember".to_string(), kind: "badge".to_string(), tagline: "A warm spark for long nights underground.".to_string(), rarity: "rare".to_string(), price: 450, glyph: Some("flame".to_string()), colors: vec!["#fbbf24".to_string(), "#f43f5e".to_string()], pattern: None },
            CosmeticItem { id: "cape-classic".to_string(), name: "Midnight".to_string(), kind: "cape".to_string(), tagline: "The default Polaris silhouette.".to_string(), rarity: "common".to_string(), price: 0, glyph: None, colors: vec!["#1e1b4b".to_string(), "#8b5cf6".to_string()], pattern: Some("classic".to_string()) },
            CosmeticItem { id: "cape-grid".to_string(), name: "Night Grid".to_string(), kind: "cape".to_string(), tagline: "A neon horizon that follows your back.".to_string(), rarity: "rare".to_string(), price: 600, glyph: None, colors: vec!["#0f172a".to_string(), "#22d3ee".to_string()], pattern: Some("grid".to_string()) },
        ];
        Self { path, items }
    }

    pub fn snapshot(&self, playtime_ms: i64) -> CosmeticSnapshot {
        let owned = vec!["badge-north".to_string(), "cape-classic".to_string()];
        let shards = (playtime_ms / 3_600_000) as u32 * 40;
        CosmeticSnapshot {
            items: self.items.clone(),
            owned,
            equipped_badge: "badge-north".to_string(),
            equipped_cape: "cape-classic".to_string(),
            shards,
            total_playtime_ms: playtime_ms,
            claimable: shards,
        }
    }

    pub fn buy(&self, id: &str) -> Result<CosmeticSnapshot, String> {
        // Simplified - just return snapshot
        Ok(self.snapshot(0))
    }

    pub fn equip(&self, id: &str) -> Result<CosmeticSnapshot, String> {
        Ok(self.snapshot(0))
    }

    pub fn claim(&self, playtime_ms: i64) -> Result<u32, String> {
        Ok((playtime_ms / 3_600_000) as u32 * 40)
    }
}