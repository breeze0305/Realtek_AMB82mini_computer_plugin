use regex::Regex;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
    thread,
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager};
use thiserror::Error;

const VERSION: &str = "2.2.2";
const AUTHOR: &str = "breeze0305";
const CONTACT: &str = "breeze0305";
const REPOSITORY: &str = "https://github.com/breeze0305/Realtek_AMB82mini_computer_plugin";
const VERSION_URL: &str =
    "https://raw.githubusercontent.com/breeze0305/Realtek_AMB82mini_computer_plugin/main/version.txt";
const ARDUINO_IDE_URL: &str =
    "https://downloads.arduino.cc/arduino-ide/arduino-ide_2.3.6_Windows_64bit.exe";
const VLC_URL: &str = "https://free.nchc.org.tw/vlc/vlc/3.0.21/win64/vlc-3.0.21-win64.exe";
const REALTEK_PACKAGE_URL: &str = "https://github.com/Ameba-AIoT/ameba-arduino-pro2/raw/dev/Arduino_package/package_realtek_amebapro2_early_index.json";
const INTERNET_CHECK_URL: &str = "https://www.cloudflare.com/cdn-cgi/trace";
const DEFAULT_LANGUAGE: &str = "zh_TW";

#[derive(Debug, Error)]
enum AppError {
    #[error("{0}")]
    Message(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct Settings {
    capture_interval: u64,
    language: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            capture_interval: 1,
            language: DEFAULT_LANGUAGE.to_string(),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
struct Dashboard {
    metadata: Metadata,
    settings: Settings,
    realtek_folder: Option<String>,
    output_folder: String,
    internet_connected: bool,
}

#[derive(Clone, Debug, Serialize)]
struct Metadata {
    author: &'static str,
    contact: &'static str,
    version: &'static str,
    repository: &'static str,
    arduino_ide_url: &'static str,
    vlc_url: &'static str,
    realtek_package_url: &'static str,
    supported_languages: Vec<&'static str>,
}

#[derive(Clone, Debug, Serialize)]
struct ActionResult {
    ok: bool,
    message: String,
    path: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
struct DownloadResult {
    file_name: String,
    path: String,
    bytes: u64,
}

#[derive(Clone, Debug, Serialize)]
struct DownloadProgress {
    key: &'static str,
    downloaded: u64,
    total: Option<u64>,
}

#[derive(Clone, Debug, Serialize)]
struct VersionCheck {
    local: String,
    remote: String,
    is_latest: bool,
    repository: &'static str,
}

#[derive(Clone, Debug, Serialize)]
struct UvcdResult {
    changed: bool,
    message: String,
    path: Option<String>,
}

struct AppState {
    settings: Mutex<Settings>,
    output_folder: Mutex<Option<PathBuf>>,
}

struct EmbeddedResource {
    path: &'static str,
    bytes: &'static [u8],
}

static EMBEDDED_RESOURCES: &[EmbeddedResource] = &[
    EmbeddedResource {
        path: "CH341SER.EXE",
        bytes: include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../resource/CH341SER.EXE"
        )),
    },
    EmbeddedResource {
        path: "gesture_recognition/hand_code.txt",
        bytes: include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../resource/gesture_recognition/hand_code.txt"
        )),
    },
    EmbeddedResource {
        path: "gesture_recognition/hand_weight.nb",
        bytes: include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../resource/gesture_recognition/hand_weight.nb"
        )),
    },
    EmbeddedResource {
        path: "image_classification_japan/img_class_cnn.nb",
        bytes: include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../resource/image_classification_japan/img_class_cnn.nb"
        )),
    },
    EmbeddedResource {
        path: "image_classification_taiwan/img_class_cnn.nb",
        bytes: include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../resource/image_classification_taiwan/img_class_cnn.nb"
        )),
    },
];

pub fn run() {
    tauri::Builder::default()
        .manage(AppState {
            settings: Mutex::new(Settings::default()),
            output_folder: Mutex::new(None),
        })
        .setup(|app| {
            let handle = app.handle().clone();
            start_uvcd_worker(handle);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_dashboard,
            set_language,
            open_realtek_folder,
            open_output_folder,
            select_output_folder,
            open_url,
            save_driver_as,
            save_hand_resources_as,
            save_image_model_japan_as,
            save_image_model_taiwan_as,
            download_arduino_ide_as,
            download_vlc_as,
            check_internet,
            check_version,
            save_capture_image
        ])
        .run(tauri::generate_context!())
        .expect("failed to run AMB82 desktop application");
}

#[tauri::command]
fn get_dashboard(state: tauri::State<AppState>) -> Result<Dashboard, AppError> {
    let settings = state
        .settings
        .lock()
        .map_err(|_| AppError::Message("Failed to read settings".into()))?
        .clone();

    Ok(Dashboard {
        metadata: metadata(),
        settings,
        realtek_folder: find_realtek_folder().map(display_path),
        output_folder: display_path(output_dir(&state)?),
        internet_connected: has_internet(),
    })
}

#[tauri::command]
fn set_language(language: String, state: tauri::State<AppState>) -> Result<Settings, AppError> {
    let supported = ["zh_TW", "en_US", "ja_JP"];
    if !supported.contains(&language.as_str()) {
        return Err(AppError::Message("Unsupported language".into()));
    }

    let mut settings = state
        .settings
        .lock()
        .map_err(|_| AppError::Message("Failed to update settings".into()))?;
    settings.language = language;
    Ok(settings.clone())
}

#[tauri::command]
fn open_realtek_folder() -> Result<ActionResult, AppError> {
    let folder = find_realtek_folder()
        .ok_or_else(|| AppError::Message("Realtek AmebaPro2 folder was not found".into()))?;
    open_in_explorer(&folder)?;
    Ok(ActionResult {
        ok: true,
        message: "Realtek folder opened".into(),
        path: Some(display_path(folder)),
    })
}

#[tauri::command]
fn open_output_folder(state: tauri::State<AppState>) -> Result<ActionResult, AppError> {
    let folder = output_dir(&state)?;
    fs::create_dir_all(&folder)?;
    open_in_explorer(&folder)?;
    Ok(ActionResult {
        ok: true,
        message: "Output folder opened".into(),
        path: Some(display_path(folder)),
    })
}

#[tauri::command]
fn select_output_folder(state: tauri::State<AppState>) -> Result<ActionResult, AppError> {
    let Some(parent_folder) = rfd::FileDialog::new()
        .set_title("Select output folder location")
        .pick_folder()
    else {
        return Err(AppError::Message("Folder selection was canceled".into()));
    };

    let folder = parent_folder.join("output");
    fs::create_dir_all(&folder)?;
    *state
        .output_folder
        .lock()
        .map_err(|_| AppError::Message("Failed to update output folder".into()))? =
        Some(folder.clone());

    Ok(ActionResult {
        ok: true,
        message: "Output folder location selected".into(),
        path: Some(display_path(folder)),
    })
}

#[tauri::command]
fn open_url(url: String) -> Result<ActionResult, AppError> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err(AppError::Message(
            "Only http and https URLs can be opened".into(),
        ));
    }

    open_in_browser(&url)?;
    Ok(ActionResult {
        ok: true,
        message: "URL opened".into(),
        path: Some(url),
    })
}

#[tauri::command]
fn save_driver_as(app: AppHandle) -> Result<ActionResult, AppError> {
    save_one_resource_as(
        &app,
        "CH341SER.EXE",
        "CH341SER.EXE",
        "Save CH340/CH341 installer",
    )
}

#[tauri::command]
fn save_hand_resources_as(app: AppHandle) -> Result<ActionResult, AppError> {
    save_resource_set_as(
        &app,
        &[
            (
                "gesture_recognition/hand_code.txt",
                "hand_code.txt",
                "Save hand tracking code",
            ),
            (
                "gesture_recognition/hand_weight.nb",
                "hand_weight.nb",
                "Save hand tracking weight",
            ),
        ],
    )
}

#[tauri::command]
fn save_image_model_japan_as(app: AppHandle) -> Result<ActionResult, AppError> {
    save_one_resource_as(
        &app,
        "image_classification_japan/img_class_cnn.nb",
        "img_class_cnn.nb",
        "Save image classification weight",
    )
}

#[tauri::command]
fn save_image_model_taiwan_as(app: AppHandle) -> Result<ActionResult, AppError> {
    save_one_resource_as(
        &app,
        "image_classification_taiwan/img_class_cnn.nb",
        "img_class_cnn.nb",
        "Save image classification weight",
    )
}

#[tauri::command]
fn download_arduino_ide_as(app: AppHandle) -> Result<DownloadResult, AppError> {
    download_url_as(
        &app,
        "arduino",
        ARDUINO_IDE_URL,
        "Save Arduino IDE installer",
    )
}

#[tauri::command]
fn download_vlc_as(app: AppHandle) -> Result<DownloadResult, AppError> {
    download_url_as(&app, "vlc", VLC_URL, "Save VLC installer")
}

#[tauri::command]
fn check_internet() -> bool {
    has_internet()
}

#[tauri::command]
fn check_version() -> Result<VersionCheck, AppError> {
    if !has_internet() {
        return Err(AppError::Message(
            "Internet connection is not available".into(),
        ));
    }

    let remote = http_agent()
        .get(VERSION_URL)
        .call()
        .map_err(http_error)?
        .into_string()
        .map_err(|error| AppError::Message(format!("HTTP read error: {error}")))?
        .trim()
        .to_string();

    Ok(VersionCheck {
        local: VERSION.to_string(),
        is_latest: remote == VERSION,
        remote,
        repository: REPOSITORY,
    })
}

#[tauri::command]
fn save_capture_image(
    bytes: Vec<u8>,
    state: tauri::State<AppState>,
) -> Result<ActionResult, AppError> {
    let folder = output_dir(&state)?;
    fs::create_dir_all(&folder)?;
    let file_path = next_image_path(&folder)?;
    fs::write(&file_path, bytes)?;

    Ok(ActionResult {
        ok: true,
        message: "Image saved".into(),
        path: Some(display_path(file_path)),
    })
}

fn metadata() -> Metadata {
    Metadata {
        author: AUTHOR,
        contact: CONTACT,
        version: VERSION,
        repository: REPOSITORY,
        arduino_ide_url: ARDUINO_IDE_URL,
        vlc_url: VLC_URL,
        realtek_package_url: REALTEK_PACKAGE_URL,
        supported_languages: vec!["zh_TW", "en_US", "ja_JP"],
    }
}

fn start_uvcd_worker(app: AppHandle) {
    thread::spawn(move || loop {
        match repair_uvcd() {
            Ok(result) if result.changed => break,
            Ok(_) => break,
            Err(_) => {
                let _ = app.emit("uvcd-status", "UVCD repair pending");
                thread::sleep(Duration::from_secs(300));
            }
        }
    });
}

fn save_one_resource_as(
    app: &AppHandle,
    source: &str,
    default_name: &str,
    title: &str,
) -> Result<ActionResult, AppError> {
    let target = save_dialog(default_name, title)
        .ok_or_else(|| AppError::Message("Save was canceled".into()))?;
    copy_resource_to(app, source, &target)?;
    Ok(ActionResult {
        ok: true,
        message: "File saved".into(),
        path: Some(display_path(target)),
    })
}

fn save_resource_set_as(
    app: &AppHandle,
    files: &[(&str, &str, &str)],
) -> Result<ActionResult, AppError> {
    let mut saved = Vec::new();

    for (source, default_name, title) in files {
        let Some(target) = save_dialog(default_name, title) else {
            if saved.is_empty() {
                return Err(AppError::Message("Save was canceled".into()));
            }
            break;
        };
        copy_resource_to(app, source, &target)?;
        saved.push(display_path(target));
    }

    Ok(ActionResult {
        ok: true,
        message: format!("Saved {} file(s)", saved.len()),
        path: Some(saved.join("\n")),
    })
}

fn copy_resource_to(app: &AppHandle, source: &str, target: &Path) -> Result<(), AppError> {
    if let Some(source_path) = external_resource_path(app, source) {
        fs::copy(source_path, target)?;
        return Ok(());
    }

    let Some(bytes) = embedded_resource_bytes(source) else {
        return Err(AppError::Message(format!(
            "Required resource not found: {}",
            source
        )));
    };
    fs::write(target, bytes)?;
    Ok(())
}

fn download_url_as(
    app: &AppHandle,
    key: &'static str,
    url: &str,
    title: &str,
) -> Result<DownloadResult, AppError> {
    if !has_internet() {
        return Err(AppError::Message(
            "Internet connection is not available".into(),
        ));
    }

    let file_name = file_name_from_url(url)?;
    let target = save_dialog(file_name, title)
        .ok_or_else(|| AppError::Message("Save was canceled".into()))?;
    download_to_path(app, key, url, &target)
}

fn download_to_path(
    app: &AppHandle,
    key: &'static str,
    url: &str,
    target: &Path,
) -> Result<DownloadResult, AppError> {
    let response = http_agent().get(url).call().map_err(http_error)?;
    let total = response
        .header("content-length")
        .and_then(|value| value.parse::<u64>().ok());
    let mut file = fs::File::create(target)?;
    let mut reader = response.into_reader();
    let mut buffer = [0_u8; 64 * 1024];
    let mut bytes = 0_u64;
    let mut last_emit = 0_u64;

    emit_download_progress(app, key, bytes, total);
    loop {
        let read = reader.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        file.write_all(&buffer[..read])?;
        bytes += read as u64;

        if bytes.saturating_sub(last_emit) >= 256 * 1024 || total == Some(bytes) {
            emit_download_progress(app, key, bytes, total);
            last_emit = bytes;
        }
    }
    file.flush()?;
    emit_download_progress(app, key, bytes, total.or(Some(bytes)));

    Ok(DownloadResult {
        file_name: target
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("download")
            .into(),
        path: display_path(target),
        bytes,
    })
}

fn emit_download_progress(app: &AppHandle, key: &'static str, downloaded: u64, total: Option<u64>) {
    let _ = app.emit(
        "download-progress",
        DownloadProgress {
            key,
            downloaded,
            total,
        },
    );
}

fn save_dialog(default_name: &str, title: &str) -> Option<PathBuf> {
    rfd::FileDialog::new()
        .set_title(title)
        .set_file_name(default_name)
        .save_file()
}

fn file_name_from_url(url: &str) -> Result<&str, AppError> {
    url.rsplit('/')
        .next()
        .filter(|name| !name.is_empty())
        .ok_or_else(|| AppError::Message("Download URL does not include a file name".into()))
}

fn http_agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(120))
        .timeout_connect(Duration::from_secs(20))
        .user_agent("AMB82-Mini-Computer-Plugin/2.2.2")
        .build()
}

fn internet_agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(3))
        .timeout_connect(Duration::from_secs(2))
        .user_agent("AMB82-Mini-Computer-Plugin/2.2.2")
        .build()
}

fn has_internet() -> bool {
    internet_agent().get(INTERNET_CHECK_URL).call().is_ok()
}

fn http_error(error: ureq::Error) -> AppError {
    AppError::Message(format!("HTTP error: {error}"))
}

fn find_realtek_folder() -> Option<PathBuf> {
    let user_profile = std::env::var_os("USERPROFILE").map(PathBuf::from)?;
    let root = user_profile
        .join("AppData")
        .join("Local")
        .join("Arduino15")
        .join("packages")
        .join("realtek")
        .join("hardware")
        .join("AmebaPro2");

    if !root.exists() {
        return None;
    }

    let mut versions: Vec<PathBuf> = fs::read_dir(&root)
        .ok()?
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.is_dir())
        .collect();
    versions.sort();
    versions.pop().or(Some(root))
}

fn repair_uvcd() -> Result<UvcdResult, AppError> {
    let version_folder = find_realtek_folder()
        .ok_or_else(|| AppError::Message("Realtek AmebaPro2 folder was not found".into()))?;
    let target = version_folder
        .join("libraries")
        .join("USB")
        .join("src")
        .join("UVCD_pram.h");

    if !target.exists() {
        return Err(AppError::Message(format!(
            "UVCD_pram.h was not found under {}",
            display_path(version_folder)
        )));
    }

    let original = fs::read_to_string(&target)?;
    let re = Regex::new(r"(?m)^(#define\s+UVCD_(?!H264\b)[A-Za-z0-9_]+\s+)\d+")
        .map_err(|error| AppError::Message(error.to_string()))?;
    let repaired = re.replace_all(&original, "${1}0").to_string();
    let changed = repaired != original;

    if changed {
        fs::write(&target, repaired)?;
    }

    Ok(UvcdResult {
        changed,
        message: if changed {
            "UVCD_pram.h repaired".into()
        } else {
            "UVCD_pram.h already matches the expected values".into()
        },
        path: Some(display_path(target)),
    })
}

fn output_dir(state: &tauri::State<AppState>) -> Result<PathBuf, AppError> {
    if let Some(folder) = state
        .output_folder
        .lock()
        .map_err(|_| AppError::Message("Failed to read output folder".into()))?
        .clone()
    {
        return Ok(folder);
    }

    Ok(std::env::current_dir()?.join("output"))
}

fn next_image_path(folder: &Path) -> Result<PathBuf, AppError> {
    let re = Regex::new(r"^image_(\d{5})\.jpg$")
        .map_err(|error| AppError::Message(error.to_string()))?;
    let mut max_id = 0_u32;

    if folder.exists() {
        for entry in fs::read_dir(folder)?.flatten() {
            let Some(name) = entry.file_name().to_str().map(str::to_string) else {
                continue;
            };
            let Some(captures) = re.captures(&name) else {
                continue;
            };
            let Ok(id) = captures[1].parse::<u32>() else {
                continue;
            };
            max_id = max_id.max(id);
        }
    }

    Ok(folder.join(format!("image_{:05}.jpg", max_id + 1)))
}

fn embedded_resource_bytes(source: &str) -> Option<&'static [u8]> {
    EMBEDDED_RESOURCES
        .iter()
        .find(|resource| resource.path == source)
        .map(|resource| resource.bytes)
}

fn external_resource_path(app: &AppHandle, source: &str) -> Option<PathBuf> {
    for root in resource_roots(app) {
        let path = root.join(relative_path(source));
        if path.exists() {
            return Some(path);
        }
    }
    None
}

fn resource_roots(app: &AppHandle) -> Vec<PathBuf> {
    let mut roots = Vec::new();

    if let Some(path) = std::env::current_dir()
        .ok()
        .map(|cwd| cwd.join("resource"))
        .filter(|path| path.exists())
    {
        roots.push(path);
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled_resource = resource_dir.join("resource");
        if bundled_resource.exists() {
            roots.push(bundled_resource);
        }
        if resource_dir.exists() {
            roots.push(resource_dir);
        }
    }

    roots
}

fn relative_path(path: &str) -> PathBuf {
    path.split('/').collect()
}

fn open_in_explorer(path: &Path) -> Result<(), AppError> {
    if !path.exists() {
        return Err(AppError::Message(format!(
            "Path does not exist: {}",
            display_path(path)
        )));
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer").arg(path).spawn()?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open").arg(path).spawn()?;
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open").arg(path).spawn()?;
    }

    Ok(())
}

fn open_in_browser(url: &str) -> Result<(), AppError> {
    #[cfg(target_os = "windows")]
    {
        Command::new("rundll32")
            .args(["url.dll,FileProtocolHandler", url])
            .spawn()?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open").arg(url).spawn()?;
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open").arg(url).spawn()?;
    }

    Ok(())
}

fn display_path(path: impl AsRef<Path>) -> String {
    path.as_ref().to_string_lossy().into_owned()
}
