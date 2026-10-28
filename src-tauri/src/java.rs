use std::path::{Path, PathBuf};
use std::process::Command;

pub fn scan_java(extra_paths: &[String]) -> Vec<String> {
    let mut found = Vec::new();
    let mut seen = std::collections::HashSet::new();

    // Check common Java locations
    let search_dirs = vec![
        PathBuf::from("C:\\Program Files\\Java"),
        PathBuf::from("C:\\Program Files (x86)\\Java"),
        PathBuf::from("C:\\Program Files\\Eclipse Adoptium"),
        PathBuf::from("C:\\Program Files\\Zulu"),
        PathBuf::from("C:\\Program Files\\Amazon Corretto"),
    ];

    for dir in &search_dirs {
        if dir.exists() {
            scan_dir(dir, &mut found, &mut seen);
        }
    }

    // Check extra paths
    for path in extra_paths {
        let p = PathBuf::from(path);
        if p.exists() {
            scan_dir(&p, &mut found, &mut seen);
        }
    }

    // Check JAVA_HOME
    if let Ok(java_home) = std::env::var("JAVA_HOME") {
        let p = PathBuf::from(java_home);
        if p.exists() && !seen.contains(&p.to_string_lossy().to_string()) {
            found.push(p.to_string_lossy().to_string());
            seen.insert(p.to_string_lossy().to_string());
        }
    }

    found
}

fn scan_dir(dir: &Path, found: &mut Vec<String>, seen: &mut std::collections::HashSet<String>) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                // Check if this is a Java installation (has bin/java.exe or bin/java)
                let java_exe = if cfg!(target_os = "windows") {
                    path.join("bin").join("java.exe")
                } else {
                    path.join("bin").join("java")
                };
                if java_exe.exists() {
                    let key = path.to_string_lossy().to_string();
                    if !seen.contains(&key) {
                        found.push(key.clone());
                        seen.insert(key);
                    }
                } else {
                    // Recurse one level
                    scan_dir(&path, found, seen);
                }
            }
        }
    }
}

pub fn get_java_version(java_path: &str) -> Option<String> {
    let java_exe = if cfg!(target_os = "windows") {
        format!("{}\\bin\\java.exe", java_path)
    } else {
        format!("{}/bin/java", java_path)
    };

    let output = Command::new(&java_exe)
        .arg("-version")
        .output()
        .ok()?;

    let stderr = String::from_utf8_lossy(&output.stderr);
    // Parse version from "openjdk version \"21.0.5\"" or "java version \"1.8.0_431\""
    for line in stderr.lines() {
        if line.contains("version") {
            if let Some(start) = line.find('"') {
                if let Some(end) = line[start + 1..].find('"') {
                    return Some(line[start + 1..start + 1 + end].to_string());
                }
            }
        }
    }
    None
}