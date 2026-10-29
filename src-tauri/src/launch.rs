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
        user_type: &str,
        settings: &crate::models::Settings,
        version: &crate::installer::VersionJson,
        data_dir: &str,
    ) -> Vec<String> {
        let instance_dir = format!("{}/{}", data_dir, instance.id);
        let assets_root = format!("{}/assets", data_dir);
        let libraries_dir = format!("{}/libraries", data_dir);

        let mut values = std::collections::HashMap::new();
        values.insert("auth_player_name".to_string(), account_name.to_string());
        values.insert("version_name".to_string(), version.id.clone());
        values.insert("game_directory".to_string(), instance_dir.clone());
        values.insert("assets_root".to_string(), assets_root.clone());
        values.insert("assets_index_name".to_string(), asset_index_id.to_string());
        values.insert("auth_uuid".to_string(), account_uuid.to_string());
        values.insert("auth_access_token".to_string(), access_token.to_string());
        values.insert("clientid".to_string(), String::new());
        values.insert("auth_xuid".to_string(), String::new());
        values.insert("user_type".to_string(), user_type.to_string());
        values.insert("version_type".to_string(), version.version_type.clone().unwrap_or_else(|| "release".to_string()));
        values.insert("natives_directory".to_string(), natives_dir.to_string());
        values.insert("launcher_name".to_string(), "Polaris".to_string());
        values.insert("launcher_version".to_string(), "0.3.4".to_string());
        values.insert("classpath".to_string(), classpath.to_string());
        let cp_sep = if cfg!(target_os = "windows") { ";" } else { ":" };
        values.insert("classpath_separator".to_string(), cp_sep.to_string());
        values.insert("library_directory".to_string(), libraries_dir.clone());
        values.insert("resolution_width".to_string(), instance.width.to_string());
        values.insert("resolution_height".to_string(), instance.height.to_string());

        let mut args = Vec::new();

        let tuning = Self::build_jvm_flags(instance.memory_mb, &instance.jvm_preset, &instance.custom_jvm_args, java_major);
        for f in &tuning {
            args.push(substitute(f, &values));
        }

        let extra_jvm = vec![
            "-Dpolaris.client=true".to_string(),
            "-Dminecraft.launcher.brand=Polaris".to_string(),
            "-Dminecraft.launcher.version=0.3.4".to_string(),
            format!("-XX:ErrorFile={}/logs/hs_err_%p.log", instance_dir),
            "-Dlog4j2.formatMsgNoLookups=true".to_string(),
            "-Dfile.encoding=UTF-8".to_string(),
        ];
        for f in &extra_jvm {
            args.push(substitute(f, &values));
        }

        args.push(format!("-Djava.library.path={}", natives_dir));
        args.push("-Dorg.lwjgl.system.allocator=system".to_string());

        if let Some(vargs) = &version.arguments {
            if let Some(jvm) = &vargs.jvm {
                for entry in jvm {
                    if let Some(s) = entry.as_str() {
                        args.push(substitute(s, &values));
                    } else if let Some(obj) = entry.as_object() {
                        if let Some(val) = obj.get("value") {
                            if let Some(s) = val.as_str() {
                                args.push(substitute(s, &values));
                            } else if let Some(arr) = val.as_array() {
                                for v in arr {
                                    if let Some(s) = v.as_str() {
                                        args.push(substitute(s, &values));
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        args.push("-cp".to_string());
        args.push(classpath.to_string());

        let main_class = version.main_class.clone().unwrap_or_else(|| "net.minecraft.client.main.Main".to_string());
        args.push(main_class);

        // Game args
        let mut game_args: Vec<String> = Vec::new();
        if let Some(vargs) = &version.arguments {
            if let Some(game) = &vargs.game {
                for entry in game {
                    if let Some(s) = entry.as_str() {
                        game_args.push(substitute(s, &values));
                    } else if let Some(obj) = entry.as_object() {
                        if let Some(val) = obj.get("value") {
                            if let Some(s) = val.as_str() {
                                game_args.push(substitute(s, &values));
                            } else if let Some(arr) = val.as_array() {
                                for v in arr {
                                    if let Some(s) = v.as_str() {
                                        game_args.push(substitute(s, &values));
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        if game_args.is_empty() {
            if let Some(mc_args) = &version.minecraft_arguments {
                game_args = mc_args.split_whitespace().map(|s| substitute(s, &values)).collect();
            }
        }

        if game_args.is_empty() {
            // Default game args
            game_args.push("--username".to_string());
            game_args.push(account_name.to_string());
            game_args.push("--version".to_string());
            game_args.push(version.id.clone());
            game_args.push("--gameDir".to_string());
            game_args.push(".".to_string());
            game_args.push("--assetsDir".to_string());
            game_args.push("assets".to_string());
            game_args.push("--assetIndex".to_string());
            game_args.push(asset_index_id.to_string());
            game_args.push("--uuid".to_string());
            game_args.push(account_uuid.to_string());
            game_args.push("--accessToken".to_string());
            game_args.push(access_token.to_string());
            game_args.push("--userType".to_string());
            game_args.push(user_type.to_string());
            game_args.push("--versionType".to_string());
            game_args.push("release".to_string());
        }

        for a in &game_args {
            args.push(a.clone());
        }

        args.push("--width".to_string());
        args.push(instance.width.to_string());
        args.push("--height".to_string());
        args.push(instance.height.to_string());

        if instance.fullscreen {
            args.push("--fullscreen".to_string());
        }

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

fn substitute(template: &str, values: &std::collections::HashMap<String, String>) -> String {
    let mut result = template.to_string();
    for (key, val) in values {
        result = result.replace(&format!("${{{}}}", key), val);
    }
    result
}
