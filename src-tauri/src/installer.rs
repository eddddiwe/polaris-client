use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

// ── Data structures ──────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct InstalledGame {
    pub version_id: String,
    pub base_version_id: String,
    pub jar_path: String,
    pub classpath: Vec<String>,
    pub natives: Vec<NativeEntry>,
    pub asset_index_id: String,
    pub java_major: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct NativeEntry {
    pub path: String,
    pub exclude: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct VersionJson {
    pub id: String,
    #[serde(rename = "type")]
    pub version_type: Option<String>,
    pub main_class: Option<String>,
    pub minecraft_arguments: Option<String>,
    pub arguments: Option<VersionArguments>,
    pub libraries: Option<Vec<Library>>,
    pub assets: Option<String>,
    pub asset_index: Option<AssetIndex>,
    pub downloads: Option<Downloads>,
    pub java_version: Option<JavaVersion>,
    pub inherits_from: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct VersionArguments {
    pub game: Option<Vec<serde_json::Value>>,
    pub jvm: Option<Vec<serde_json::Value>>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Library {
    pub name: String,
    pub url: Option<String>,
    pub rules: Option<Vec<Rule>>,
    pub natives: Option<std::collections::HashMap<String, String>>,
    pub extract: Option<ExtractSpec>,
    pub downloads: Option<LibraryDownloads>,
    pub sha1: Option<String>,
    pub size: Option<u64>,
    pub checksums: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ExtractSpec {
    pub exclude: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LibraryDownloads {
    pub artifact: Option<Artifact>,
    pub classifiers: Option<std::collections::HashMap<String, Artifact>>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Artifact {
    pub path: String,
    pub url: String,
    pub sha1: Option<String>,
    pub size: Option<u64>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Rule {
    pub action: String,
    pub os: Option<OsRule>,
    pub features: Option<std::collections::HashMap<String, bool>>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct OsRule {
    pub name: Option<String>,
    pub version: Option<String>,
    pub arch: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AssetIndex {
    pub id: String,
    pub sha1: Option<String>,
    pub size: Option<u64>,
    pub total_size: Option<u64>,
    pub url: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Downloads {
    pub client: Option<Artifact>,
    pub server: Option<Artifact>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct JavaVersion {
    pub component: Option<String>,
    pub major_version: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ManifestVersion {
    pub id: String,
    #[serde(rename = "type")]
    pub version_type: String,
    pub url: String,
    pub time: String,
    pub release_time: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Manifest {
    pub latest: ManifestLatest,
    pub versions: Vec<ManifestVersion>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ManifestLatest {
    pub release: String,
    pub snapshot: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AssetIndexFile {
    pub objects: std::collections::HashMap<String, AssetObject>,
    pub virtual_: Option<bool>,
    #[serde(rename = "map_to_resources")]
    pub map_to_resources: Option<bool>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AssetObject {
    pub hash: String,
    pub size: u64,
}

// ── Paths ────────────────────────────────────────────────────────────────

pub struct InstallerPaths {
    pub versions: PathBuf,
    pub libraries: PathBuf,
    pub assets: PathBuf,
    pub meta: PathBuf,
}

pub struct Installer {
    paths: InstallerPaths,
}

// ── OS/arch helpers ──────────────────────────────────────────────────────

fn os_name() -> &'static str {
    if cfg!(target_os = "windows") { "windows" }
    else if cfg!(target_os = "macos") { "osx" }
    else { "linux" }
}

fn arch_name() -> &'static str {
    if cfg!(target_arch = "x86_64") { "x64" }
    else if cfg!(target_arch = "aarch64") { "arm64" }
    else if cfg!(target_arch = "x86") { "x86" }
    else { "unknown" }
}

fn rules_allow(rules: &Option<Vec<Rule>>) -> bool {
    let rules = match rules {
        Some(r) if !r.is_empty() => r,
        _ => return true,
    };
    let mut allowed = false;
    let mut has_matching = false;
    for rule in rules {
        // Check OS match
        if let Some(os_rule) = &rule.os {
            if let Some(name) = &os_rule.name {
                if name != os_name() { continue; }
            }
            if let Some(arch) = &os_rule.arch {
                let arch_aliases: &[&str] = match arch_name() {
                    "x64" => &["x86_64", "x86-64", "amd64", "x64"],
                    "ia32" => &["x86", "i386", "i686"],
                    "arm64" => &["arm64", "aarch64"],
                    _ => &[],
                };
                if !arch_aliases.contains(&arch.as_str()) && arch != arch_name() {
                    continue;
                }
            }
        }
        has_matching = true;
        allowed = rule.action == "allow";
    }
    if !has_matching { true } else { allowed }
}

// ── Maven helpers ────────────────────────────────────────────────────────

fn parse_maven(name: &str) -> (String, String, String, Option<String>, String) {
    let (coords_part, ext_part) = if name.contains('@') {
        let parts: Vec<&str> = name.splitn(2, '@').collect();
        (parts[0], parts[1])
    } else {
        (name, "jar")
    };
    let parts: Vec<&str> = coords_part.split(':').collect();
    if parts.len() < 3 {
        return (String::new(), String::new(), String::new(), None, ext_part.to_string());
    }
    let group = parts[0].to_string();
    let artifact = parts[1].to_string();
    let version = parts[2].to_string();
    let classifier = if parts.len() > 3 { Some(parts[3].to_string()) } else { None };
    (group, artifact, version, classifier, ext_part.to_string())
}

fn maven_path(name: &str) -> String {
    let (group, artifact, version, classifier, ext) = parse_maven(name);
    let file = if let Some(c) = classifier {
        format!("{}-{}-{}.{}", artifact, version, c, ext)
    } else {
        format!("{}-{}.{}", artifact, version, ext)
    };
    format!("{}/{}/{}/{}", group.replace('.', "/"), artifact, version, file)
}

// ── Installer implementation ─────────────────────────────────────────────

impl Installer {
    pub fn new(paths: InstallerPaths) -> Self {
        Self { paths }
    }

    async fn fetch_version_json(&self, mc_version: &str) -> Result<VersionJson, String> {
        // Check local cache first
        let local_path = self.paths.versions.join(mc_version).join(format!("{}.json", mc_version));
        if local_path.exists() {
            if let Ok(content) = fs::read_to_string(&local_path) {
                if let Ok(v) = serde_json::from_str::<VersionJson>(&content) {
                    if v.libraries.is_some() {
                        return Ok(v);
                    }
                }
            }
        }

        // Fetch manifest
        let manifest_url = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
        let client = reqwest::Client::new();
        let res = client.get(manifest_url).send().await.map_err(|e| e.to_string())?;
        let manifest: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;

        let versions = manifest.get("versions").and_then(|v| v.as_array())
            .ok_or("No versions found")?;
        let version_entry = versions.iter()
            .find(|v| v.get("id").and_then(|id| id.as_str()) == Some(mc_version))
            .ok_or_else(|| format!("Minecraft version {} not found", mc_version))?;

        let version_url = version_entry.get("url").and_then(|u| u.as_str())
            .ok_or("No version URL found")?;

        // Fetch version JSON
        let res = client.get(version_url).send().await.map_err(|e| e.to_string())?;
        let version: VersionJson = res.json().await.map_err(|e| e.to_string())?;

        // Cache locally
        let version_dir = self.paths.versions.join(mc_version);
        fs::create_dir_all(&version_dir).ok();
        if let Ok(json) = serde_json::to_string_pretty(&version) {
            fs::write(version_dir.join(format!("{}.json", mc_version)), json).ok();
        }

        Ok(version)
    }

    fn os_name_str() -> &'static str { os_name() }

    pub async fn install(&self, mc_version: &str, loader: &str, loader_version: Option<&str>, mirror_cache: bool) -> Result<InstalledGame, String> {
        // 1. Fetch base version JSON
        let base = self.fetch_version_json(mc_version).await?;

        // 2. Handle Fabric loader
        let (version_id, mut version) = if loader == "fabric" {
            let lv = if let Some(lv) = loader_version {
                lv.to_string()
            } else {
                // Choose latest stable loader
                let client = reqwest::Client::new();
                let url = format!("https://meta.fabricmc.net/v2/versions/loader/{}", mc_version);
                let res = client.get(&url).send().await.map_err(|e| e.to_string())?;
                let loaders: Vec<serde_json::Value> = res.json().await.map_err(|e| e.to_string())?;
                loaders.iter()
                    .find(|l| l.get("loader").and_then(|x| x.get("stable")).and_then(|s| s.as_bool()) == Some(true))
                    .or_else(|| loaders.first())
                    .and_then(|l| l.get("loader").and_then(|x| x.get("version")).and_then(|v| v.as_str()))
                    .unwrap_or("0.15.0")
                    .to_string()
            };

            let vid = format!("fabric-loader-{}-{}", lv, mc_version);

            // Fetch Fabric profile
            let profile_url = format!(
                "https://meta.fabricmc.net/v2/versions/loader/{}/{}/profile/json",
                mc_version, lv
            );
            let client = reqwest::Client::new();
            let res = client.get(&profile_url).send().await.map_err(|e| e.to_string())?;
            let fabric_profile: VersionJson = res.json().await.map_err(|e| e.to_string())?;

            // Cache profile
            let vid_dir = self.paths.versions.join(&vid);
            fs::create_dir_all(&vid_dir).ok();
            if let Ok(json) = serde_json::to_string_pretty(&fabric_profile) {
                fs::write(vid_dir.join(format!("{}.json", vid)), json).ok();
            }

            // Merge versions (fabric profile + base)
            let merged = merge_versions(&fabric_profile, &base);
            (vid, merged)
        } else {
            (mc_version.to_string(), base.clone())
        };

        // 3. Download client jar
        let jar_path = self.paths.versions.join(&version_id).join(format!("{}.jar", version_id));
        if let Some(downloads) = &version.downloads {
            if let Some(client_dl) = &downloads.client {
                let dest = self.paths.versions.join(&version_id).join(format!("{}.jar", version_id));
                let downloader = crate::http::Downloader::new();
                fs::create_dir_all(self.paths.versions.join(&version_id)).ok();
                downloader.download(&client_dl.url, &dest).await.map_err(|e| e.to_string())?;
            }
        } else if version_id == mc_version {
            // For vanilla, the client jar URL is in downloads.client
            // Already handled above
        }

        // 4. Download assets
        let asset_index_id = if let Some(asset_index) = &version.asset_index {
            let index_id = asset_index.id.clone();
            let index_path = self.paths.assets.join("indexes").join(format!("{}.json", index_id));

            // Download index if not cached
            if !index_path.exists() {
                fs::create_dir_all(self.paths.assets.join("indexes")).ok();
                let downloader = crate::http::Downloader::new();
                downloader.download(&asset_index.url, &index_path).await.map_err(|e| e.to_string())?;
            }

            // Parse index and download objects
            if let Ok(content) = fs::read_to_string(&index_path) {
                if let Ok(index_file) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(objects) = index_file.get("objects").and_then(|o| o.as_object()) {
                        let obj_dir = self.paths.assets.join("objects");
                        let downloader = crate::http::Downloader::new();
                        for (hash_hex, obj) in objects {
                            let hash = obj.get("hash").and_then(|h| h.as_str()).unwrap_or("");
                            if hash.is_empty() { continue; }
                            let prefix = &hash[..2];
                            let obj_path = obj_dir.join(prefix).join(hash);
                            if !obj_path.exists() {
                                fs::create_dir_all(obj_path.parent().unwrap()).ok();
                                let url = format!("https://resources.download.minecraft.net/{}/{}", prefix, hash);
                                let _ = downloader.download(&url, &obj_path).await;
                            }
                        }
                    }
                }
            }

            index_id
        } else {
            version.assets.clone().unwrap_or_else(|| mc_version.to_string())
        };

        // 5. Download libraries
        let mut classpath = Vec::new();
        let mut natives = Vec::new();
        let mut seen = std::collections::HashSet::new();

        if let Some(libraries) = &version.libraries {
            let downloader = crate::http::Downloader::new();
            for lib in libraries {
                if !rules_allow(&lib.rules) { continue; }

                // Resolve artifacts
                let mut artifacts: Vec<(String, String, bool, Option<Vec<String>>)> = Vec::new(); // (relative_path, url, extract, exclude)

                // Main artifact
                if let Some(downloads) = &lib.downloads {
                    if let Some(artifact) = &downloads.artifact {
                        artifacts.push((artifact.path.clone(), artifact.url.clone(), false, lib.extract.as_ref().and_then(|e| e.exclude.clone())));
                    }
                } else if let Some(url_base) = &lib.url {
                    // Legacy format: construct URL from maven coords
                    let rel_path = maven_path(&lib.name);
                    let url = format!("{}/{}", url_base.trim_end_matches('/'), rel_path);
                    artifacts.push((rel_path, url, false, lib.extract.as_ref().and_then(|e| e.exclude.clone())));
                }

                // Native artifact
                if let Some(natives_map) = &lib.natives {
                    let os = os_name();
                    if let Some(native_key) = natives_map.get(os) {
                        let classifier = native_key.replace("${arch}", if arch_name() == "x64" { "64" } else { "32" });
                        if let Some(downloads) = &lib.downloads {
                            if let Some(classifiers) = &downloads.classifiers {
                                if let Some(native_artifact) = classifiers.get(&classifier) {
                                    artifacts.push((native_artifact.path.clone(), native_artifact.url.clone(), true, lib.extract.as_ref().and_then(|e| e.exclude.clone())));
                                }
                            }
                        } else if let Some(url_base) = &lib.url {
                            // Legacy native
                            let (group, artifact, ver, _, ext) = parse_maven(&lib.name);
                            let file = format!("{}-{}-{}.{}", artifact, ver, classifier, ext);
                            let rel_path = format!("{}/{}/{}/{}", group.replace('.', "/"), artifact, ver, file);
                            let url = format!("{}/{}", url_base.trim_end_matches('/'), rel_path);
                            artifacts.push((rel_path, url, true, lib.extract.as_ref().and_then(|e| e.exclude.clone())));
                        }
                    }
                }

                for (rel_path, url, extract, exclude) in artifacts {
                    let dest = self.paths.libraries.join(&rel_path);
                    if !seen.contains(&dest.to_string_lossy().to_string()) {
                        seen.insert(dest.to_string_lossy().to_string());
                        if !dest.exists() {
                            fs::create_dir_all(dest.parent().unwrap()).ok();
                            let _ = downloader.download(&url, &dest).await;
                        }

                        if extract {
                            natives.push(NativeEntry {
                                path: dest.to_string_lossy().to_string(),
                                exclude,
                            });
                        } else {
                            classpath.push(dest.to_string_lossy().to_string());
                        }
                    }
                }
            }
        }

        // Add client jar to classpath
        classpath.push(jar_path.to_string_lossy().to_string());

        // Java major version
        let java_major = version.java_version.as_ref().map(|jv| jv.major_version).unwrap_or(8);

        Ok(InstalledGame {
            version_id,
            base_version_id: mc_version.to_string(),
            jar_path: jar_path.to_string_lossy().to_string(),
            classpath,
            natives,
            asset_index_id,
            java_major,
        })
    }

    pub async fn extract_natives(&self, natives: &[NativeEntry], destination: &Path) -> Result<(), String> {
        // Clean destination
        if destination.exists() {
            fs::remove_dir_all(destination).ok();
        }
        fs::create_dir_all(destination).ok();

        for entry in natives {
            let path = Path::new(&entry.path);
            if !path.exists() { continue; }

            let file = fs::File::open(path).map_err(|e| e.to_string())?;
            let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

            for i in 0..archive.len() {
                let mut zip_file = archive.by_index(i).map_err(|e| e.to_string())?;
                if zip_file.is_dir() { continue; }

                let name = zip_file.name().replace('\\', "/");
                if name.starts_with("META-INF/") { continue; }

                // Check exclude
                if let Some(exclude) = &entry.exclude {
                    if exclude.iter().any(|ex| name.starts_with(ex)) { continue; }
                }

                // Prevent path traversal
                let normalized = name.replace("..", "");
                let target = destination.join(&normalized);
                if !target.starts_with(destination) { continue; }

                if let Some(parent) = target.parent() {
                    fs::create_dir_all(parent).ok();
                }
                let mut out_file = fs::File::create(&target).map_err(|e| e.to_string())?;
                let mut buf = Vec::new();
                zip_file.read_to_end(&mut buf).map_err(|e| e.to_string())?;
                out_file.write_all(&buf).map_err(|e| e.to_string())?;
            }
        }

        Ok(())
    }
}

// ── Merge versions (Fabric) ──────────────────────────────────────────────

fn merge_versions(child: &VersionJson, parent: &VersionJson) -> VersionJson {
    // Merge libraries: parent first, then child, dedup by name
    let mut merged_libs = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for lib in parent.libraries.as_ref().unwrap_or(&Vec::new()) {
        if seen.insert(lib.name.clone()) {
            merged_libs.push(lib.clone());
        }
    }
    for lib in child.libraries.as_ref().unwrap_or(&Vec::new()) {
        if seen.insert(lib.name.clone()) {
            merged_libs.push(lib.clone());
        }
    }

    // Merge game args
    let mut game_args = Vec::new();
    if let Some(parent_args) = &parent.arguments {
        if let Some(g) = &parent_args.game {
            game_args.extend(g.clone());
        }
    }
    if let Some(child_args) = &child.arguments {
        if let Some(g) = &child_args.game {
            game_args.extend(g.clone());
        }
    }

    let mut jvm_args = Vec::new();
    if let Some(parent_args) = &parent.arguments {
        if let Some(j) = &parent_args.jvm {
            jvm_args.extend(j.clone());
        }
    }
    if let Some(child_args) = &child.arguments {
        if let Some(j) = &child_args.jvm {
            jvm_args.extend(j.clone());
        }
    }

    VersionJson {
        id: child.id.clone(),
        version_type: child.version_type.clone().or(parent.version_type.clone()),
        main_class: child.main_class.clone().or(parent.main_class.clone()),
        minecraft_arguments: child.minecraft_arguments.clone().or(parent.minecraft_arguments.clone()),
        arguments: Some(VersionArguments {
            game: Some(game_args),
            jvm: Some(jvm_args),
        }),
        libraries: Some(merged_libs),
        assets: child.assets.clone().or(parent.assets.clone()),
        asset_index: child.asset_index.clone().or(parent.asset_index.clone()),
        downloads: {
            let mut d = parent.downloads.clone().unwrap_or(Downloads { client: None, server: None });
            if let Some(cd) = &child.downloads {
                if cd.client.is_some() { d.client = cd.client.clone(); }
                if cd.server.is_some() { d.server = cd.server.clone(); }
            }
            Some(d)
        },
        java_version: child.java_version.clone().or(parent.java_version.clone()),
        inherits_from: None,
    }
}