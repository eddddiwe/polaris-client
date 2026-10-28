use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ModrinthProject {
    pub id: String,
    pub slug: String,
    pub title: String,
    pub description: String,
    pub icon_url: Option<String>,
    pub project_type: String,
    pub downloads: u64,
    pub followers: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ModrinthVersion {
    pub id: String,
    pub project_id: String,
    pub version_number: String,
    pub name: String,
    pub game_versions: Vec<String>,
    pub loaders: Vec<String>,
    pub files: Vec<ModrinthFile>,
    pub dependencies: Vec<ModrinthDependency>,
    pub date_published: String,
    pub downloads: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ModrinthFile {
    pub url: String,
    pub filename: String,
    pub primary: bool,
    pub size: u64,
    pub hashes: ModrinthHashes,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ModrinthHashes {
    pub sha1: Option<String>,
    pub sha512: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ModrinthDependency {
    pub version_id: Option<String>,
    pub project_id: Option<String>,
    pub dependency_type: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ModrinthSearchResult {
    pub hits: Vec<ModrinthSearchHit>,
    pub total_hits: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ModrinthSearchHit {
    pub project_id: String,
    pub slug: String,
    pub title: String,
    pub description: String,
    pub icon_url: Option<String>,
    pub downloads: u64,
    pub followers: u64,
    pub project_type: String,
    pub versions: Vec<String>,
    pub categories: Vec<String>,
}

pub struct ModrinthClient {
    client: reqwest::Client,
}

impl ModrinthClient {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::new(),
        }
    }

    pub async fn project(&self, id_or_slug: &str) -> Result<ModrinthProject, String> {
        let url = format!("https://api.modrinth.com/v2/project/{}", id_or_slug);
        let res = self.client.get(&url).send().await.map_err(|e| e.to_string())?;
        if !res.status().is_success() {
            return Err(format!("Modrinth API error: {}", res.status()));
        }
        res.json().await.map_err(|e| e.to_string())
    }

    pub async fn versions(&self, project_id: &str, loader: &str, game_version: &str) -> Result<Vec<ModrinthVersion>, String> {
        let mut url = format!("https://api.modrinth.com/v2/project/{}/version", project_id);
        let mut params = Vec::new();
        if !loader.is_empty() {
            params.push(format!("loaders=[\"{}\"]", loader));
        }
        if !game_version.is_empty() {
            params.push(format!("game_versions=[\"{}\"]", game_version));
        }
        if !params.is_empty() {
            url = format!("{}?{}", url, params.join("&"));
        }
        let res = self.client.get(&url).send().await.map_err(|e| e.to_string())?;
        if !res.status().is_success() {
            return Err(format!("Modrinth API error: {}", res.status()));
        }
        res.json().await.map_err(|e| e.to_string())
    }

    pub async fn search(&self, query: &str, project_type: &str, limit: u32, offset: u32) -> Result<ModrinthSearchResult, String> {
        let url = format!(
            "https://api.modrinth.com/v2/search?query={}&facets=[[\"project_type:{}\"]]&limit={}&offset={}",
            urlencoding::encode(query),
            project_type,
            limit,
            offset
        );
        let res = self.client.get(&url).send().await.map_err(|e| e.to_string())?;
        if !res.status().is_success() {
            return Err(format!("Modrinth API error: {}", res.status()));
        }
        res.json().await.map_err(|e| e.to_string())
    }

    pub fn pick_version(versions: &[ModrinthVersion], mc_version: &str, loader: &str) -> Option<ModrinthVersion> {
        let filtered: Vec<&ModrinthVersion> = versions.iter()
            .filter(|v| v.game_versions.iter().any(|g| g == mc_version))
            .filter(|v| v.loaders.iter().any(|l| l == loader))
            .collect();

        if filtered.is_empty() {
            return versions.first().cloned();
        }

        // Prefer release versions
        let result = filtered.iter()
            .find(|v| v.version_number.contains("release") || !v.version_number.contains("beta") && !v.version_number.contains("alpha"))
            .copied()
            .or_else(|| filtered.first().copied());
        result.cloned()
    }

    pub fn primary_file(version: &ModrinthVersion) -> Option<&ModrinthFile> {
        version.files.iter().find(|f| f.primary).or_else(|| version.files.first())
    }
}