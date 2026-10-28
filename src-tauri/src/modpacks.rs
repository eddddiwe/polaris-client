use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MrpackIndex {
    pub format_version: u32,
    pub game: String,
    pub version_id: Option<String>,
    pub name: Option<String>,
    pub summary: Option<String>,
    pub files: Vec<MrpackFile>,
    pub dependencies: Option<HashMap<String, String>>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MrpackFile {
    pub path: String,
    pub hashes: Option<MrpackHashes>,
    pub env: Option<MrpackEnv>,
    pub downloads: Option<Vec<String>>,
    pub file_size: Option<u64>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MrpackHashes {
    pub sha1: Option<String>,
    pub sha512: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MrpackEnv {
    pub client: Option<String>,
    pub server: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MrpackPlan {
    pub name: String,
    pub pack_version: String,
    pub mc_version: String,
    pub loader: String,
    pub loader_version: Option<String>,
    pub files: Vec<MrpackPlanFile>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MrpackPlanFile {
    pub path: String,
    pub url: String,
    pub sha1: Option<String>,
    pub size: Option<u64>,
    pub optional: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ModpackPopulateResult {
    pub files_installed: u32,
    pub files_skipped: u32,
    pub overrides_extracted: u32,
}

pub struct ModpackService {
    instances_dir: PathBuf,
}

impl ModpackService {
    pub fn new(instances_dir: PathBuf) -> Self {
        Self { instances_dir }
    }

    pub fn parse_index(raw: &str, fallback_game_version: Option<&str>) -> Result<MrpackPlan, String> {
        let index: MrpackIndex = serde_json::from_str(raw.trim_start_matches('\u{FEFF}'))
            .map_err(|_| "modrinth.index.json is not valid JSON".to_string())?;

        if index.game != "minecraft" {
            return Err("Only Minecraft modpacks are supported".to_string());
        }
        if index.format_version != 1 {
            return Err(format!("Unsupported mrpack format version {}", index.format_version));
        }

        let dependencies = index.dependencies.unwrap_or_default();
        let minecraft = dependencies.get("minecraft")
            .cloned()
            .or_else(|| fallback_game_version.map(|s| s.to_string()));
        let minecraft = match minecraft {
            Some(v) => v,
            None => return Err("This modpack does not declare a Minecraft version".to_string()),
        };

        let loader_version = dependencies.get("fabric-loader").cloned();
        let mut loader = "vanilla".to_string();
        if loader_version.is_some() {
            loader = "fabric".to_string();
        } else if dependencies.contains_key("quilt-loader")
            || dependencies.contains_key("forge")
            || dependencies.contains_key("neo-forge")
            || dependencies.contains_key("neoforge")
        {
            return Err("Only Fabric modpacks are supported in this release (Quilt/Forge packs were rejected)".to_string());
        }

        let files: Vec<MrpackPlanFile> = index.files.iter().filter_map(|file| {
            let env = file.env.as_ref().and_then(|e| e.client.clone()).unwrap_or_else(|| "required".to_string());
            if env == "unsupported" {
                return None;
            }
            let url = file.downloads.as_ref()?.first()?.clone();
            let path = Self::normalize_archive_path(&file.path)?;
            Some(MrpackPlanFile {
                path,
                url,
                sha1: file.hashes.as_ref().and_then(|h| h.sha1.clone()),
                size: file.file_size,
                optional: env == "optional",
            })
        }).collect();

        Ok(MrpackPlan {
            name: index.name.unwrap_or_else(|| "Modpack".to_string()),
            pack_version: index.version_id.unwrap_or_else(|| "0".to_string()),
            mc_version: minecraft,
            loader,
            loader_version,
            files,
        })
    }

    pub fn normalize_archive_path(input: &str) -> Option<String> {
        let normalized = input.replace('\\', "/").trim_start_matches('/').to_string();
        if normalized.is_empty() || normalized.ends_with('/') {
            return None;
        }
        if normalized.chars().next().map(|c| c.is_ascii_alphabetic()).unwrap_or(false)
            && normalized.chars().nth(1) == Some(':') {
            return None;
        }
        let segments: Vec<&str> = normalized.split('/').collect();
        if segments.iter().any(|s| s.is_empty() || *s == "." || *s == "..") {
            return None;
        }
        Some(normalized)
    }

    pub fn safe_override_path(instance_dir: &str, entry_name: &str, prefix: &str) -> Option<String> {
        let normalized = entry_name.replace('\\', "/");
        if !normalized.starts_with(prefix) {
            return None;
        }
        let relative = normalized[prefix.len()..].trim_start_matches('/');
        if relative.is_empty() || relative.ends_with('/') {
            return None;
        }
        let segments: Vec<&str> = relative.split('/').collect();
        if segments.iter().any(|s| s.is_empty() || *s == "." || *s == "..") {
            return None;
        }
        let target = format!("{}/{}", instance_dir, relative);
        if !target.to_lowercase().starts_with(&instance_dir.to_lowercase()) {
            return None;
        }
        Some(target)
    }

    pub async fn populate(&self, instance_id: &str, archive_path: &str, plan: &MrpackPlan, include_optional: bool) -> Result<ModpackPopulateResult, String> {
        let instance_dir = self.instances_dir.join(instance_id);
        std::fs::create_dir_all(&instance_dir).ok();

        // Extract overrides
        let mut zip = zip::ZipArchive::new(std::fs::File::open(archive_path).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        let mut overrides_extracted = 0u32;
        for i in 0..zip.len() {
            let mut file = zip.by_index(i).map_err(|e| e.to_string())?;
            let name = file.name().to_string();
            if file.is_dir() { continue; }
            let target = Self::safe_override_path(&instance_dir.to_string_lossy(), &name, "overrides/")
                .or_else(|| Self::safe_override_path(&instance_dir.to_string_lossy(), &name, "client-overrides/"));
            if let Some(target) = target {
                if let Some(parent) = std::path::Path::new(&target).parent() {
                    std::fs::create_dir_all(parent).ok();
                }
                let mut out = std::fs::File::create(&target).map_err(|e| e.to_string())?;
                std::io::copy(&mut file, &mut out).map_err(|e| e.to_string())?;
                overrides_extracted += 1;
            }
        }

        // Download mod files
        let wanted: Vec<&MrpackPlanFile> = plan.files.iter()
            .filter(|f| !f.optional || include_optional)
            .collect();
        let skipped = plan.files.len() as u32 - wanted.len() as u32;

        let downloader = crate::http::Downloader::new();
        for file in &wanted {
            let dest = instance_dir.join(&file.path);
            if let Some(parent) = dest.parent() {
                std::fs::create_dir_all(parent).ok();
            }
            if let Err(e) = downloader.download(&file.url, &dest).await {
                // Log error but continue
                eprintln!("Failed to download {}: {}", file.path, e);
            }
        }

        Ok(ModpackPopulateResult {
            files_installed: wanted.len() as u32,
            files_skipped: skipped,
            overrides_extracted,
        })
    }
}