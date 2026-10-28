use crate::accounts::AccountStore;
use crate::events::EventEmitter;
use crate::models::Account;
use serde::Deserialize;
use std::sync::Arc;
use tokio::sync::Mutex;

const DEVICE_CODE_URL: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode";
const TOKEN_URL: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
const SCOPE: &str = "XboxLive.signin offline_access";

#[derive(Deserialize)]
struct DeviceCodeResponse {
    device_code: String,
    user_code: String,
    verification_uri: String,
    expires_in: u64,
    interval: u64,
    message: String,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: Option<String>,
    refresh_token: Option<String>,
    expires_in: Option<u64>,
    error: Option<String>,
    error_description: Option<String>,
}

#[derive(Deserialize)]
#[allow(non_snake_case)]
struct XblResponse {
    Token: String,
    DisplayClaims: XblDisplayClaims,
}

#[derive(Deserialize)]
struct XblDisplayClaims {
    xui: Vec<XuiClaim>,
}

#[derive(Deserialize)]
struct XuiClaim {
    uhs: String,
    xid: Option<String>,
}

#[derive(Deserialize)]
struct McAuthResponse {
    access_token: String,
    expires_in: Option<u64>,
}

#[derive(Deserialize)]
struct McProfile {
    id: String,
    name: String,
    skins: Option<Vec<McSkin>>,
}

#[derive(Deserialize)]
struct McSkin {
    url: String,
}

pub struct AuthService {
    store: Arc<Mutex<AccountStore>>,
}

impl AuthService {
    pub fn new(store: AccountStore) -> Self {
        Self { store: Arc::new(Mutex::new(store)) }
    }

    pub async fn begin_device_login(
        &self,
        client_id: String,
        emitter: EventEmitter,
    ) -> Result<crate::models::DeviceCodeInfo, String> {
        if client_id.trim().is_empty() {
            return Err("Microsoft sign-in needs a client ID. Set it in Settings.".to_string());
        }

        let client = reqwest::Client::new();
        let body = format!("client_id={}&scope={}", urlencoding::encode(&client_id), urlencoding::encode(SCOPE));
        let res = client.post(DEVICE_CODE_URL)
            .header("Content-Type", "application/x-www-form-urlencoded")
            .body(body)
            .send().await.map_err(|e| e.to_string())?;
        if !res.status().is_success() {
            return Err(format!("Device code request failed ({})", res.status()));
        }
        let device: DeviceCodeResponse = res.json().await.map_err(|e| e.to_string())?;

        let info = crate::models::DeviceCodeInfo {
            user_code: device.user_code.clone(),
            verification_uri: device.verification_uri.clone(),
            expires_in: device.expires_in as u32,
            message: device.message.clone(),
        };
        emitter.emit_device_code(crate::events::DeviceCodeEvent {
            user_code: device.user_code.clone(),
            verification_uri: device.verification_uri.clone(),
            expires_in: device.expires_in as u32,
            message: device.message.clone(),
        });

        // Spawn background polling task
        let store = self.store.clone();
        let cid = client_id.clone();
        let dev = device;
        tokio::spawn(async move {
            let client = reqwest::Client::new();
            let deadline = std::time::Instant::now() + std::time::Duration::from_secs(dev.expires_in);
            let mut interval_ms = (dev.interval.max(3)) * 1000;
            while std::time::Instant::now() < deadline {
                tokio::time::sleep(std::time::Duration::from_millis(interval_ms)).await;
                let body = format!(
                    "client_id={}&grant_type=urn:ietf:params:oauth:grant-type:device_code&device_code={}",
                    urlencoding::encode(&cid),
                    urlencoding::encode(&dev.device_code)
                );
                let res = client.post(TOKEN_URL)
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .body(body)
                    .send().await;
                match res {
                    Ok(r) => {
                        let token: TokenResponse = r.json().await.unwrap_or(TokenResponse {
                            access_token: None, refresh_token: None, expires_in: None,
                            error: Some("parse_error".to_string()), error_description: None,
                        });
                        if let Some(err) = &token.error {
                            match err.as_str() {
                                "authorization_pending" => continue,
                                "slow_down" => { interval_ms += 2000; continue; }
                                "expired_token" => {
                                    emitter.emit_account_error(crate::events::AccountErrorEvent {
                                        message: "The sign-in code expired. Try again.".to_string(),
                                    });
                                    return;
                                }
                                "access_denied" => {
                                    emitter.emit_account_error(crate::events::AccountErrorEvent {
                                        message: "Microsoft sign-in was cancelled.".to_string(),
                                    });
                                    return;
                                }
                                _ => {
                                    emitter.emit_account_error(crate::events::AccountErrorEvent {
                                        message: token.error_description.clone().unwrap_or_else(|| err.clone()),
                                    });
                                    return;
                                }
                            }
                        }
                        if let Some(at) = token.access_token {
                            match complete_login(&client, &cid, &at, token.refresh_token.as_deref(), token.expires_in).await {
                                Ok(account) => {
                                    let mut guard = store.lock().await;
                                    let _ = guard.add(account.clone(), true);
                                    let accounts = guard.list();
                                    drop(guard);
                                    emitter.emit_account_changed(crate::events::AccountChangedEvent {
                                        accounts,
                                        active_account_id: Some(account.id.clone()),
                                    });
                                }
                                Err(e) => {
                                    emitter.emit_account_error(crate::events::AccountErrorEvent { message: e });
                                }
                            }
                            return;
                        }
                    }
                    Err(e) => {
                        emitter.emit_account_error(crate::events::AccountErrorEvent {
                            message: format!("Network error: {}", e),
                        });
                        return;
                    }
                }
            }
            emitter.emit_account_error(crate::events::AccountErrorEvent {
                message: "The sign-in code expired. Try again.".to_string(),
            });
        });

        Ok(info)
    }

    pub async fn refresh_if_needed(&self, account: &Account) -> Result<Account, String> {
        if account.account_type != "microsoft" { return Ok(account.clone()); }
        let expires_at = account.expires_at.unwrap_or(0);
        if expires_at - 60_000 > chrono::Utc::now().timestamp_millis() {
            return Ok(account.clone());
        }
        let refresh_token = account.refresh_token.clone().ok_or("Session expired. Sign in with Microsoft again.")?;
        let client_id = account.client_id.clone().ok_or("Session expired. Sign in with Microsoft again.")?;

        let client = reqwest::Client::new();
        let body = format!(
            "client_id={}&grant_type=refresh_token&refresh_token={}&scope={}",
            urlencoding::encode(&client_id),
            urlencoding::encode(&refresh_token),
            urlencoding::encode(SCOPE)
        );
        let res = client.post(TOKEN_URL)
            .header("Content-Type", "application/x-www-form-urlencoded")
            .body(body)
            .send().await.map_err(|e| e.to_string())?;
        if !res.status().is_success() {
            return Err("Microsoft session refresh failed. Sign in again.".to_string());
        }
        let token: TokenResponse = res.json().await.map_err(|e| e.to_string())?;
        let at = token.access_token.ok_or("No access token")?;
        let new_account = complete_login(&client, &client_id, &at, token.refresh_token.as_deref().or(Some(&refresh_token)), token.expires_in).await?;

        let store = self.store.lock().await;
        let _ = store.update(&account.id, serde_json::json!({
            "name": new_account.name,
            "uuid": new_account.uuid.clone().unwrap_or_default(),
            "skinUrl": new_account.skin_url.clone().unwrap_or_default(),
            "accessToken": new_account.access_token.clone().unwrap_or_default(),
            "refreshToken": new_account.refresh_token.clone().unwrap_or_default(),
            "expiresAt": new_account.expires_at.unwrap_or(0),
            "xuid": new_account.xuid.clone().unwrap_or_default(),
        }));
        Ok(new_account)
    }
}

async fn complete_login(
    client: &reqwest::Client,
    client_id: &str,
    ms_access_token: &str,
    refresh_token: Option<&str>,
    expires_in: Option<u64>,
) -> Result<Account, String> {
    // XBL auth
    let xbl_body = serde_json::json!({
        "Properties": {
            "AuthMethod": "RPS",
            "SiteName": "user.auth.xboxlive.com",
            "RpsTicket": format!("d={}", ms_access_token)
        },
        "RelyingParty": "http://auth.xboxlive.com",
        "TokenType": "JWT"
    });
    let xbl: XblResponse = client.post("https://user.auth.xboxlive.com/user/authenticate")
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&xbl_body)
        .send().await.map_err(|e| e.to_string())?
        .json().await.map_err(|e| e.to_string())?;

    let uhs = xbl.DisplayClaims.xui.first().map(|x| x.uhs.clone()).ok_or("No UHS")?;
    let xuid = xbl.DisplayClaims.xui.first().and_then(|x| x.xid.clone());

    // XSTS auth
    let xsts_body = serde_json::json!({
        "Properties": {
            "SandboxId": "RETAIL",
            "UserTokens": [xbl.Token]
        },
        "RelyingParty": "rp://api.minecraftservices.com/",
        "TokenType": "JWT"
    });
    let xsts: XblResponse = client.post("https://xsts.auth.xboxlive.com/xsts/authorize")
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&xsts_body)
        .send().await.map_err(|e| format!("XSTS failed: {}", e))?
        .json().await.map_err(|e| e.to_string())?;

    // Handle XSTS errors
    // (simplified - full error handling in Electron version)

    // Minecraft auth
    let mc_body = serde_json::json!({
        "identityToken": format!("XBL3.0 x={};{}", uhs, xsts.Token)
    });
    let mc_res = client.post("https://api.minecraftservices.com/authentication/login_with_xbox")
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&mc_body)
        .send().await.map_err(|e| e.to_string())?;
    if mc_res.status() == reqwest::StatusCode::FORBIDDEN {
        return Err("Minecraft rejected this application (403). Apply at https://aka.ms/AppRegInfo".to_string());
    }
    if !mc_res.status().is_success() {
        return Err(format!("Minecraft auth failed ({})", mc_res.status()));
    }
    let mc: McAuthResponse = mc_res.json().await.map_err(|e| e.to_string())?;

    // Profile
    let profile_res = client.get("https://api.minecraftservices.com/minecraft/profile")
        .header("Authorization", format!("Bearer {}", mc.access_token))
        .send().await.map_err(|e| e.to_string())?;
    if profile_res.status() == reqwest::StatusCode::NOT_FOUND {
        return Err("This Microsoft account does not own Minecraft: Java Edition.".to_string());
    }
    if !profile_res.status().is_success() {
        return Err(format!("Minecraft profile request failed ({})", profile_res.status()));
    }
    let profile: McProfile = profile_res.json().await.map_err(|e| e.to_string())?;

    let uuid = format_uuid(&profile.id);
    let skin_url = profile.skins.as_ref().and_then(|s| s.first()).map(|s| s.url.clone());

    Ok(Account {
        id: format!("ms:{}", profile.id),
        name: profile.name,
        account_type: "microsoft".to_string(),
        uuid: Some(uuid),
        skin_url,
        active: true,
        access_token: Some(mc.access_token),
        refresh_token: refresh_token.map(|s| s.to_string()),
        expires_at: Some(chrono::Utc::now().timestamp_millis() + (mc.expires_in.unwrap_or(86400) as i64) * 1000),
        client_id: Some(client_id.to_string()),
        xuid,
    })
}

fn format_uuid(id: &str) -> String {
    let hex = id.replace('-', "");
    if hex.len() < 32 { return id.to_string(); }
    format!("{}-{}-{}-{}-{}", &hex[0..8], &hex[8..12], &hex[12..16], &hex[16..20], &hex[20..32])
}


