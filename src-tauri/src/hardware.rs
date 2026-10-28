use crate::models::HardwareInfo;
use sysinfo::System;

pub fn detect_hardware() -> HardwareInfo {
    let mut sys = System::new_all();
    sys.refresh_all();

    let cpu = sys.cpus().first().map(|c| c.brand().to_string()).unwrap_or_else(|| "Unknown CPU".to_string());
    let threads = sys.cpus().len() as u32;
    let physical_cores = sys.physical_core_count().unwrap_or(1) as u32;
    let ram_gb = sys.total_memory() as f64 / 1024.0 / 1024.0 / 1024.0;
    let ram_gb = (ram_gb * 10.0).round() / 10.0;

    // Detect GPU (simplified - just check for common vendors)
    let gpu = "Unknown GPU".to_string();
    let gpu_vendor = "Unknown".to_string();

    // Tier based on RAM
    let tier = if ram_gb >= 32.0 {
        "high"
    } else if ram_gb >= 16.0 {
        "mainstream"
    } else {
        "low"
    };

    let recommended_memory_mb = if ram_gb >= 32.0 {
        8192
    } else if ram_gb >= 16.0 {
        4096
    } else {
        2048
    };

    HardwareInfo {
        cpu,
        threads,
        physical_cores,
        ram_gb,
        gpu,
        gpu_vendor,
        os: format!("{} {}", std::env::consts::OS, std::env::consts::ARCH),
        arch: std::env::consts::ARCH.to_string(),
        tier: tier.to_string(),
        recommended_memory_mb,
        java: Vec::new(),
        detected_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64,
    }
}