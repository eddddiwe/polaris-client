use sha2::Sha256;
use sha1::Sha1;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;

pub struct Downloader {
    client: reqwest::Client,
    concurrency: usize,
}

impl Downloader {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::new(),
            concurrency: 8,
        }
    }

    pub fn with_concurrency(concurrency: usize) -> Self {
        Self {
            client: reqwest::Client::new(),
            concurrency: concurrency.max(1),
        }
    }

    pub async fn download(&self, url: &str, dest: &Path) -> Result<(), String> {
        self.download_item(&DownloadItem {
            url: url.to_string(),
            dest: dest.to_path_buf(),
            sha1: None,
            size: None,
            label: String::new(),
            mirror: None,
        }).await
    }

    pub async fn download_item(&self, item: &DownloadItem) -> Result<(), String> {
        // Check if already valid
        if item.dest.exists() {
            if let Some(sha1) = &item.sha1 {
                if file_sha1(&item.dest) == Some(sha1.clone()) {
                    return Ok(());
                }
            } else if item.dest.metadata().map(|m| m.len() > 0).unwrap_or(false) {
                return Ok(());
            }
        }

        // Try mirror first
        if let Some(mirror) = &item.mirror {
            if mirror.exists() {
                if let Some(sha1) = &item.sha1 {
                    if file_sha1(mirror) == Some(sha1.clone()) {
                        if let Some(parent) = item.dest.parent() {
                            fs::create_dir_all(parent).ok();
                        }
                        fs::copy(mirror, &item.dest).map_err(|e| e.to_string())?;
                        return Ok(());
                    }
                } else if mirror.metadata().map(|m| m.len() > 0).unwrap_or(false) {
                    if let Some(parent) = item.dest.parent() {
                        fs::create_dir_all(parent).ok();
                    }
                    fs::copy(mirror, &item.dest).map_err(|e| e.to_string())?;
                    return Ok(());
                }
            }
        }

        // Download from URL
        let response = self.client.get(&item.url).send().await.map_err(|e| e.to_string())?;
        if !response.status().is_success() {
            return Err(format!("Download failed: HTTP {}", response.status()));
        }
        let bytes = response.bytes().await.map_err(|e| e.to_string())?;

        if let Some(parent) = item.dest.parent() {
            fs::create_dir_all(parent).ok();
        }

        // Write to temp file first
        let tmp = item.dest.with_extension("part");
        let mut file = fs::File::create(&tmp).map_err(|e| e.to_string())?;
        file.write_all(&bytes).map_err(|e| e.to_string())?;
        drop(file);

        // Verify SHA1
        if let Some(sha1) = &item.sha1 {
            let actual = file_sha1(&tmp).ok_or("Failed to compute sha1")?;
            if actual.to_lowercase() != sha1.to_lowercase() {
                let _ = fs::remove_file(&tmp);
                return Err(format!("Checksum mismatch for {}", item.label));
            }
        }

        // Move temp to final
        if item.dest.exists() {
            fs::remove_file(&item.dest).ok();
        }
        fs::rename(&tmp, &item.dest).map_err(|e| e.to_string())?;

        Ok(())
    }

    pub async fn download_all(&self, items: Vec<DownloadItem>) -> Result<(), String> {
        if items.is_empty() {
            return Ok(());
        }

        // Deduplicate by dest
        let mut seen = std::collections::HashSet::new();
        let mut unique = Vec::new();
        for item in items {
            let key = item.dest.to_string_lossy().to_string().to_lowercase();
            if seen.insert(key) {
                unique.push(item);
            }
        }

        let client = self.client.clone();
        let concurrency = self.concurrency;

        // Process in chunks for concurrency
        let mut results: Vec<Result<(), String>> = Vec::new();
        for chunk in unique.chunks(concurrency) {
            let mut handles = Vec::new();
            for item in chunk {
                let item = item.clone();
                let client = client.clone();
                let dl = Downloader { client, concurrency: 1 };
                handles.push(tokio::spawn(async move {
                    dl.download_item(&item).await
                }));
            }
            for h in handles {
                match h.await {
                    Ok(Ok(())) => {}
                    Ok(Err(e)) => results.push(Err(e)),
                    Err(e) => results.push(Err(format!("Task failed: {}", e))),
                }
            }
        }

        // Return first error if any
        if let Some(err) = results.into_iter().find_map(|r| r.err()) {
            return Err(err);
        }
        Ok(())
    }

    pub async fn fetch_json<T: serde::de::DeserializeOwned>(&self, url: &str) -> Result<T, String> {
        let res = self.client.get(url).send().await.map_err(|e| e.to_string())?;
        if !res.status().is_success() {
            return Err(format!("HTTP {}", res.status()));
        }
        res.json().await.map_err(|e| e.to_string())
    }
}

#[derive(Clone)]
pub struct DownloadItem {
    pub url: String,
    pub dest: PathBuf,
    pub sha1: Option<String>,
    pub size: Option<u64>,
    pub label: String,
    pub mirror: Option<PathBuf>,
}

fn file_sha1(path: &Path) -> Option<String> {
    use sha1::Digest;
    let data = fs::read(path).ok()?;
    let mut hasher = Sha1::new();
    hasher.update(&data);
    Some(format!("{:x}", hasher.finalize()))
}
