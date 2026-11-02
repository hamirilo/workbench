//! App-wide settings, kept in `app_config_dir()/settings.json` and changed
//! from the tray menu's check items.

use std::{fs, io, path::PathBuf, sync::Mutex};

use serde::{Deserialize, Serialize};

pub const REMOVE_LABEL: &str = "出したら棚から外す";
pub const HIDE_LABEL: &str = "出したら棚を隠す";

#[derive(Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Values {
    /// Take items off the shelf once they have been dragged out and dropped.
    pub remove_after_use: bool,
    /// Hide the shelf once items have been dragged out and dropped.
    pub hide_after_use: bool,
}

impl Default for Values {
    fn default() -> Self {
        Self { remove_after_use: true, hide_after_use: true }
    }
}

pub struct Settings {
    file: PathBuf,
    values: Mutex<Values>,
}

impl Settings {
    /// Loads the settings from `file`, falling back to the defaults for
    /// anything missing or unreadable.
    pub fn load(file: PathBuf) -> Self {
        let values = fs::read(&file).ok().and_then(|bytes| serde_json::from_slice(&bytes).ok()).unwrap_or_default();
        Self { file, values: Mutex::new(values) }
    }

    pub fn get(&self) -> Values {
        *self.values.lock().unwrap()
    }

    /// Changes the settings with `f` and saves them. Returns the new values.
    pub fn update(&self, f: impl FnOnce(&mut Values)) -> io::Result<Values> {
        let mut values = self.values.lock().unwrap();
        f(&mut values);
        if let Some(dir) = self.file.parent() {
            fs::create_dir_all(dir)?;
        }
        let tmp = self.file.with_extension("json.tmp");
        fs::write(&tmp, serde_json::to_vec_pretty(&*values)?)?;
        fs::rename(&tmp, &self.file)?;
        Ok(*values)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        let dir = std::env::temp_dir().join(format!("shelf-settings-{name}-{nanos}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn defaults_to_removing_and_hiding() {
        let dir = temp_dir("default");
        let values = Settings::load(dir.join("settings.json")).get();
        assert!(values.remove_after_use);
        assert!(values.hide_after_use);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn persists_changes_and_fills_in_missing_keys() {
        let dir = temp_dir("persist");
        let file = dir.join("settings.json");
        Settings::load(file.clone()).update(|v| v.hide_after_use = false).unwrap();
        let values = Settings::load(file.clone()).get();
        assert!(values.remove_after_use);
        assert!(!values.hide_after_use);

        fs::write(&file, r#"{"removeAfterUse":false}"#).unwrap();
        let values = Settings::load(file).get();
        assert!(!values.remove_after_use);
        assert!(values.hide_after_use);
        fs::remove_dir_all(dir).unwrap();
    }
}
