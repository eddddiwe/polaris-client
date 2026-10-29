use serde::{Deserialize, Serialize};
use std::process::{Command, Child, Stdio};
use std::path::{Path, PathBuf};
use std::io::{BufRead, BufReader};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LaunchState {
    pub instance_id: Option<String>,
    pub status: String,
    pub message: String,
    pub pid: Option<u32>,
    pub started_at: Option<i64>,
    pub exit_code: Option<i32>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct InstalledGame {
    pub version: serde_json::Value,
    pub classpath: Vec<String>,
    pub asset_index_id: String,
    pub natives: Vec<String>,
    pub java_major: u32,
}

pub struct LaunchService {
    // In production, this would hold references to:
    // - paths: Paths
    // - installer: Installer
    // - accounts: AccountStore
    // - auth: AuthService
    // - logger: Logger
}

impl LaunchService {
    pub fn new() -> Self {
        Self {}
    }

    pub fn build_classpath(libraries: &[String], client_jar: &str, separator: &str) -> String {
        let mut parts: Vec<String> = libraries.to_vec();
        parts.push(client_jar.to_string());
        parts.join(separator)
    }

    pub fn build_jvm_flags(memory_mb: u32, jvm_preset: &str, custom_args: &str, java_major: u32) -> Vec<String> {
        let mut flags = Vec::new();
        flags.push(format!("-Xms{}M", memory_mb));
        flags.push(format!("-Xmx{}M", memory_mb));

        match jvm_preset {
            "aikar" => {
                flags.push("-XX:+UseG1GC".to_string());
                flags.push("-XX:+ParallelRefProcEnabled".to_string());
                flags.push("-XX:MaxGCPauseMillis=200".to_string());
                flags.push("-XX:+UnlockExperimentalVMOptions".to_string());
                flags.push("-XX:+DisableExplicitGC".to_string());
                flags.push("-XX:+AlwaysPreTouch".to_string());
                flags.push("-XX:G1NewSizePercent=30".to_string());
                flags.push("-XX:G1MaxNewSizePercent=40".to_string());
                flags.push("-XX:G1HeapRegionSize=8M".to_string());
                flags.push("-XX:G1ReservePercent=20".to_string());
                flags.push("-XX:G1HeapWastePercent=5".to_string());
                flags.push("-XX:G1MixedGCCountTarget=4".to_string());
                flags.push("-XX:InitiatingHeapOccupancyPercent=15".to_string());
                flags.push("-XX:G1MixedGCLiveThresholdPercent=90".to_string());
                flags.push("-XX:G1RSetUpdatingPauseTimePercent=5".to_string());
                flags.push("-XX:SurvivorRatio=32".to_string());
                flags.push("-XX:+PerfDisableSharedMem".to_string());
                flags.push("-XX:MaxTenuringThreshold=1".to_string());
            }
            "zgc" => {
                flags.push("-XX:+UseZGC".to_string());
                flags.push("-XX:+ZGenerational".to_string());
                flags.push("-XX:+AlwaysPreTouch".to_string());
                flags.push("-XX:+DisableExplicitGC".to_string());
            }
            "low-latency" => {
                flags.push("-XX:+UseG1GC".to_string());
                flags.push("-XX:MaxGCPauseMillis=50".to_string());
            }
            _ => {
                flags.push("-XX:+UseG1GC".to_string());
            }
        }

        if !custom_args.is_empty() {
            flags.extend(custom_args.split_whitespace().map(String::from));
        }

        flags
    }

    pub fn build_arguments(
        instance: &crate::models::Instance,
        java_major: u32,
        classpath: &str,
        asset_index_id: &str,
        natives_dir: &str,
        account_name: &str,
        account_uuid: &str,
        access_token: &str,
        user_type: &str
    ) -> Vec<String> {
        let mut args = Vec::new();

        // JVM flags
        args.extend(Self::build_jvm_flags(instance.memory_mb, &instance.jvm_preset, &instance.custom_jvm_args, java_major));

        // Natives
        args.push(format!("-Djava.library.path={}", natives_dir));
        args.push("-Dorg.lwjgl.system.allocator=system".to_string());

        // Main class
        args.push("-cp".to_string());
        args.push(classpath.to_string());

        // Game arguments
        args.push("net.minecraft.client.main.Main".to_string());
        args.push("--username".to_string());
        args.push(account_name.to_string());
        args.push("--version".to_string());
        args.push(instance.mc_version.clone());
        args.push("--gameDir".to_string());
        args.push(".".to_string());
        args.push("--assetsDir".to_string());
        args.push("assets".to_string());
        args.push("--assetIndex".to_string());
        args.push(asset_index_id.to_string());
        args.push("--uuid".to_string());
        args.push(account_uuid.to_string());
        args.push("--accessToken".to_string());
        args.push(access_token.to_string());
        args.push("--userType".to_string());
        args.push(user_type.to_string());
        args.push("--versionType".to_string());
        args.push("release".to_string());

        // Resolution
        args.push("--width".to_string());
        args.push(instance.width.to_string());
        args.push("--height".to_string());
        args.push(instance.height.to_string());

        if instance.fullscreen {
            args.push("--fullscreen".to_string());
        }

        // Extra game args
        if !instance.extra_game_args.is_empty() {
            args.extend(instance.extra_game_args.split_whitespace().map(String::from));
        }

        args
    }

    pub fn launch(
        java_path: &str,
        args: &[String],
        instance_dir: &str,
    ) -> Result<Child, String> {
        use std::process::Command;
        let child = Command::new(java_path)
            .args(args)
            .current_dir(instance_dir)
            .env("POLARIS_CLIENT", "1")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to launch game: {}", e))?;
        Ok(child)
    }

    pub fn classpath_separator() -> &'static str {
        if cfg!(target_os = "windows") { ";" } else { ":" }
    }
}