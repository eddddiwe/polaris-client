use serde::Serialize;
use tauri::{AppHandle, Emitter};

#[derive(Serialize, Clone, Debug)]
pub struct ProgressEvent {
    pub task_id: String,
    pub label: String,
    pub detail: String,
    pub current: u64,
    pub total: u64,
    pub done: bool,
}

#[derive(Serialize, Clone, Debug)]
pub struct LaunchStateEvent {
    pub instance_id: Option<String>,
    pub status: String,
    pub pid: Option<u32>,
}

#[derive(Serialize, Clone, Debug)]
pub struct GameLogEvent {
    pub instance_id: String,
    pub lines: Vec<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct GameStateEvent {
    pub running: bool,
    pub instance_id: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct AccountChangedEvent {
    pub accounts: Vec<crate::models::Account>,
    pub active_account_id: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct AccountErrorEvent {
    pub message: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct DeviceCodeEvent {
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u32,
    pub message: String,
}

pub struct EventEmitter {
    app: AppHandle,
}

impl EventEmitter {
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }

    pub fn emit_progress(&self, event: ProgressEvent) {
        let _ = self.app.emit("progress", event);
    }

    pub fn emit_launch_state(&self, event: LaunchStateEvent) {
        let _ = self.app.emit("launch-state", event);
    }

    pub fn emit_game_log(&self, event: GameLogEvent) {
        let _ = self.app.emit("game-log", event);
    }

    pub fn emit_game_state(&self, event: GameStateEvent) {
        let _ = self.app.emit("game-state", event);
    }

    pub fn emit_account_changed(&self, event: AccountChangedEvent) {
        let _ = self.app.emit("account-changed", event);
    }

    pub fn emit_account_error(&self, event: AccountErrorEvent) {
        let _ = self.app.emit("account-error", event);
    }

    pub fn emit_device_code(&self, event: DeviceCodeEvent) {
        let _ = self.app.emit("device-code", event);
    }
}