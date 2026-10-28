use crate::models::UpdateInfo;
use serde::Deserialize;

#[derive(Deserialize, Debug)]
struct GitHubRelease {
    tag_name: Option<String>,
    body: Option<String>,
    published_at: Option<String>,
    assets: Option<Vec<GitHubAsset>>,
}

#[derive(Deserialize, Debug)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
}

pub async fn check_for_updates(current_version: &str) -> UpdateInfo {
    let repo = "eddddiwe/polaris-client";
    let url = format!("https://api.github.com/repos/{}/releases/latest", repo);

    let client = reqwest::Client::new();
    match client
        .get(&url)
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", "Polaris-Client")
        .send()
        .await
    {
        Ok(res) => {
            if !res.status().is_success() {
                return UpdateInfo {
                    has_update: false,
                    current_version: current_version.to_string(),
                    latest_version: current_version.to_string(),
                    download_url: String::new(),
                    published_at: String::new(),
                    release_notes: None,
                };
            }
            match res.json::<GitHubRelease>().await {
                Ok(data) => {
                    let latest_version = data
                        .tag_name
                        .as_deref()
                        .unwrap_or("0.0.0")
                        .trim_start_matches('v')
                        .to_string();
                    let has_update = compare_versions(&latest_version, current_version) > 0;
                    let asset = data
                        .assets
                        .as_ref()
                        .and_then(|a| a.iter().find(|a| a.name == "Polaris-Setup.exe"))
                        .or_else(|| data.assets.as_ref().and_then(|a| a.first()));
                    UpdateInfo {
                        has_update,
                        current_version: current_version.to_string(),
                        latest_version,
                        download_url: asset
                            .map(|a| a.browser_download_url.clone())
                            .unwrap_or_else(|| format!("https://github.com/{}/releases/latest", repo)),
                        published_at: data.published_at.unwrap_or_default(),
                        release_notes: data.body,
                    }
                }
                Err(_) => UpdateInfo {
                    has_update: false,
                    current_version: current_version.to_string(),
                    latest_version: current_version.to_string(),
                    download_url: String::new(),
                    published_at: String::new(),
                    release_notes: None,
                },
            }
        }
        Err(_) => UpdateInfo {
            has_update: false,
            current_version: current_version.to_string(),
            latest_version: current_version.to_string(),
            download_url: String::new(),
            published_at: String::new(),
            release_notes: None,
        },
    }
}

fn compare_versions(a: &str, b: &str) -> i32 {
    let pa: Vec<i32> = a.split('.').filter_map(|s| s.parse().ok()).collect();
    let pb: Vec<i32> = b.split('.').filter_map(|s| s.parse().ok()).collect();
    let max_len = pa.len().max(pb.len());
    for i in 0..max_len {
        let na = pa.get(i).copied().unwrap_or(0);
        let nb = pb.get(i).copied().unwrap_or(0);
        if na != nb {
            return na - nb;
        }
    }
    0
}

pub async fn install_update(download_url: &str) -> Result<(), String> {
    if download_url.is_empty() {
        return Err("No download URL available".to_string());
    }

    let temp_dir = std::env::temp_dir();
    let file_name = download_url.split('/').last().unwrap_or("Polaris-Setup.exe");
    let dest_path = temp_dir.join(file_name);

    // Download the file
    let client = reqwest::Client::new();
    let response = client.get(download_url).send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("Download failed: HTTP {}", response.status()));
    }
    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    std::fs::write(&dest_path, &bytes).map_err(|e| e.to_string())?;

    // Run the installer
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        Command::new(&dest_path)
            .arg("/S")
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        Command::new("open")
            .arg(&dest_path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        Command::new("xdg-open")
            .arg(&dest_path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    // Quit after a short delay
    tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
    std::process::exit(0);

    Ok(())
}