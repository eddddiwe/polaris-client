use std::path::PathBuf;

pub struct Paths {
    pub root: PathBuf,
    pub settings: PathBuf,
    pub accounts: PathBuf,
    pub instances: PathBuf,
    pub versions: PathBuf,
    pub libraries: PathBuf,
    pub assets: PathBuf,
    pub meta: PathBuf,
    pub java: PathBuf,
    pub cache: PathBuf,
    pub logs: PathBuf,
    pub downloads: PathBuf,
}

pub fn resolve_root() -> PathBuf {
    if let Ok(home) = std::env::var("POLARIS_HOME") {
        return PathBuf::from(home);
    }
    dirs::data_dir()
        .map(|p| p.join("Polaris"))
        .unwrap_or_else(|| PathBuf::from("."))
}

pub fn create_paths(root: PathBuf) -> Paths {
    Paths {
        settings: root.join("settings.json"),
        accounts: root.join("accounts.json"),
        instances: root.join("instances"),
        versions: root.join("versions"),
        libraries: root.join("libraries"),
        assets: root.join("assets"),
        meta: root.join("meta"),
        java: root.join("java"),
        cache: root.join("cache"),
        logs: root.join("logs"),
        downloads: root.join("downloads"),
        root,
    }
}