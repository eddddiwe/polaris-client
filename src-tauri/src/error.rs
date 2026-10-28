use serde::Serialize;
use std::fmt;

#[derive(Debug, Serialize)]
pub enum PolarisError {
    Io(String),
    Json(String),
    Network(String),
    NotFound(String),
    InvalidInput(String),
    Unknown(String),
}

impl fmt::Display for PolarisError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            PolarisError::Io(e) => write!(f, "IO error: {}", e),
            PolarisError::Json(e) => write!(f, "JSON error: {}", e),
            PolarisError::Network(e) => write!(f, "Network error: {}", e),
            PolarisError::NotFound(e) => write!(f, "Not found: {}", e),
            PolarisError::InvalidInput(e) => write!(f, "Invalid input: {}", e),
            PolarisError::Unknown(e) => write!(f, "Unknown error: {}", e),
        }
    }
}

impl From<std::io::Error> for PolarisError {
    fn from(e: std::io::Error) -> Self {
        PolarisError::Io(e.to_string())
    }
}

impl From<serde_json::Error> for PolarisError {
    fn from(e: serde_json::Error) -> Self {
        PolarisError::Json(e.to_string())
    }
}

impl From<reqwest::Error> for PolarisError {
    fn from(e: reqwest::Error) -> Self {
        PolarisError::Network(e.to_string())
    }
}

pub type Result<T, E = PolarisError> = std::result::Result<T, E>;