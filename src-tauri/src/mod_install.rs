use crate::modrinth::ModrinthClient;
use crate::mods::ModsService;
use crate::http::Downloader;
use serde_json::Value;
use std::path::PathBuf;

pub async fn install_mod(
    instance_id: &str,
    project_id: &str,
    mc_version: &str,
    loader: &str,
    instances_dir: &PathBuf,
    downloader: &Downloader,
    modrinth: &ModrinthClient,
) -> Result<Value, String> {
    // 1. Fetch project info
    let project = modrinth.project(project_id).await.map_err(|e| e)?;
    
    // 2. Fetch versions
    let versions = modrinth.versions(project_id, loader, mc_version).await.map_err(|e| e)?;
    
    // 3. Pick best version
    let version = ModrinthClient::pick_version(&versions, mc_version, loader)
        .ok_or_else(|| format!("No compatible version for {} {}", mc_version, loader))?;
    
    // 4. Get primary file
    let file = ModrinthClient::primary_file(&version)
        .ok_or_else(|| "No downloadable file found".to_string())?;
    
    // 5. Download file
    let mods_dir = instances_dir.join(instance_id).join("mods");
    std::fs::create_dir_all(&mods_dir).ok();
    let dest = mods_dir.join(&file.filename);
    
    downloader.download(&file.url, &dest).await.map_err(|e| e)?;
    
    // 6. Update mod index
    let mods_service = ModsService::new(instances_dir.clone());
    let mut index = mods_service.list(instance_id);
    
    let installed_mod = crate::models::InstalledMod {
        project_id: project.id.clone(),
        slug: project.slug.clone(),
        name: project.title.clone(),
        version_id: version.id.clone(),
        version_number: version.version_number.clone(),
        filename: file.filename.clone(),
        size: file.size,
        enabled: true,
        source: "manual".to_string(),
        icon_url: project.icon_url.clone(),
        has_update: None,
    };
    
    // Remove existing entry if present
    index.retain(|m| m.project_id != project.id);
    index.push(installed_mod);
    
    mods_service.save_index(instance_id, &index).map_err(|e| e)?;
    
    Ok(serde_json::json!({
        "status": "installed",
        "name": project.title,
        "version": version.version_number,
        "filename": file.filename
    }))
}