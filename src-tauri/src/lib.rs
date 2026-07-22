use regex::Regex;
use serde::{Deserialize, Serialize};
use std::{
    cmp::Ordering,
    collections::{BTreeSet, HashMap},
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager};
use thiserror::Error;

const AUTHOR: &str = "breeze0305";
const CONTACT: &str = "breeze0305";
const DEFAULT_LANGUAGE: &str = "zh_TW";
const DEFAULT_UVCD_FORMAT: &str = "MJPG";
const DEFAULT_PREFERENCE_VERSION: &str = "beta";
const SUPPORTED_UVCD_FORMATS: &[&str] = &["YUY2", "NV12", "MJPG", "H264", "H265"];
const SUPPORTED_PREFERENCE_VERSIONS: &[&str] = &["release", "beta"];
const ALLOWED_EXTERNAL_URL_HOSTS: &[&str] = &[
    "github.com",
    "raw.githubusercontent.com",
    "downloads.arduino.cc",
    "get.videolan.org",
    "mirror.twds.com.tw",
    "modelconverter.ntnu-aiot.com",
];
const ENDPOINT_MANIFEST_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/endpoint_manifest.json"
));
const VERSION_TEXT: &str = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/../version.txt"));

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
#[serde(default)]
struct Settings {
    capture_interval: u64,
    language: String,
    uvcd_format: String,
    preference_version: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            capture_interval: 1,
            language: DEFAULT_LANGUAGE.to_string(),
            uvcd_format: DEFAULT_UVCD_FORMAT.to_string(),
            preference_version: DEFAULT_PREFERENCE_VERSION.to_string(),
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
    repository: String,
    arduino_ide_url: String,
    vlc_url: String,
    realtek_package_url: String,
    model_converter_url: String,
    model_converter_api_base: String,
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
    is_beta: bool,
    repository: String,
}

#[derive(Clone, Debug, Serialize)]
struct AnnotationWorkspace {
    image_folder: String,
    labels_folder: String,
    images: Vec<AnnotationImage>,
    classes: Vec<String>,
    annotations: HashMap<String, Vec<AnnotationBox>>,
    invalid_class_ids: Vec<usize>,
}

#[derive(Clone, Debug, Serialize)]
struct AnnotationImage {
    name: String,
    path: String,
    annotation_count: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct AnnotationBox {
    class_id: usize,
    x_center: f64,
    y_center: f64,
    width: f64,
    height: f64,
}

#[derive(Clone, Debug, Serialize)]
struct AnnotationImageData {
    mime: String,
    bytes: Vec<u8>,
}

#[derive(Clone, Debug, Serialize)]
struct AnnotationSaveResult {
    path: String,
    count: usize,
}

#[derive(Clone, Debug, Serialize)]
struct UvcdResult {
    changed: bool,
    message: String,
    path: Option<String>,
    format: String,
}

#[derive(Clone, Debug, Serialize)]
struct SettingsResetResult {
    dashboard: Dashboard,
    uvcd: UvcdResult,
}

#[derive(Clone, Debug, Deserialize)]
struct EndpointManifest {
    repository: String,
    version_check: UrlSet,
    downloads: DownloadManifest,
    realtek_packages: RealtekPackageManifest,
    model_converter: ModelConverterManifest,
    internet_check_urls: Vec<String>,
}

#[derive(Clone, Debug, Deserialize)]
struct DownloadManifest {
    arduino_ide: UrlSet,
    arduino_ide_msi: UrlSet,
    vlc: UrlSet,
}

#[derive(Clone, Debug, Deserialize)]
struct RealtekPackageManifest {
    beta: UrlSet,
    release: UrlSet,
}

#[derive(Clone, Debug, Deserialize)]
struct ModelConverterManifest {
    site_url: String,
    api_base: String,
}

#[derive(Clone, Debug, Deserialize)]
struct UrlSet {
    urls: Vec<String>,
}

struct AppState {
    settings: Mutex<Settings>,
    output_folder: Mutex<Option<PathBuf>>,
    capture_lock: Mutex<()>,
    native_dialog_lock: Mutex<()>,
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
        path: "gesture_recognition/yolov7_tiny.nb",
        bytes: include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../resource/gesture_recognition/yolov7_tiny.nb"
        )),
    },
    EmbeddedResource {
        path: "object_detection_box/code.txt",
        bytes: include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../resource/object_detection_box/code.txt"
        )),
    },
    EmbeddedResource {
        path: "object_detection_box/yolov7_tiny.nb",
        bytes: include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../resource/object_detection_box/yolov7_tiny.nb"
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
    EmbeddedResource {
        path: "image_classification_singapore/img_class_cnn.nb",
        bytes: include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../resource/image_classification_singapore/img_class_cnn.nb"
        )),
    },
];

pub fn run() {
    let settings = load_settings().unwrap_or_default();

    tauri::Builder::default()
        .manage(AppState {
            settings: Mutex::new(settings),
            output_folder: Mutex::new(None),
            capture_lock: Mutex::new(()),
            native_dialog_lock: Mutex::new(()),
        })
        .setup(|app| {
            install_camera_permission_handler(app);
            let handle = app.handle().clone();
            start_uvcd_worker(handle);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_dashboard,
            set_language,
            set_uvcd_format,
            set_preference_version,
            reset_settings,
            open_realtek_folder,
            open_output_folder,
            select_output_folder,
            open_url,
            save_driver_as,
            save_hand_resources_as,
            save_object_detection_box_resources_as,
            save_image_model_japan_as,
            save_image_model_taiwan_as,
            save_image_model_singapore_as,
            download_arduino_ide_as,
            download_and_install_arduino_ide,
            download_vlc_as,
            download_and_install_vlc,
            download_model_conversion_as,
            check_internet,
            check_version,
            save_capture_image,
            select_annotation_folder,
            load_annotation_folder,
            read_annotation_image,
            save_annotation_classes,
            save_annotation_file,
            save_annotation_workspace
        ])
        .run(tauri::generate_context!())
        .expect("failed to run AMB82 desktop application");
}

#[cfg(windows)]
fn install_camera_permission_handler(app: &tauri::App) {
    let Some(window) = app.get_webview_window("main") else {
        eprintln!("main webview window not found; camera permission handler not installed");
        return;
    };

    if let Err(error) = window.with_webview(|webview| {
        use webview2_com::Microsoft::Web::WebView2::Win32::{
            ICoreWebView2Profile4, ICoreWebView2_13, COREWEBVIEW2_PERMISSION_KIND,
            COREWEBVIEW2_PERMISSION_KIND_CAMERA, COREWEBVIEW2_PERMISSION_STATE_ALLOW,
        };
        use webview2_com::{PermissionRequestedEventHandler, SetPermissionStateCompletedHandler};
        use windows::core::{Interface, HSTRING};

        let result = (|| -> webview2_com::Result<()> {
            let controller = webview.controller();
            let webview = unsafe { controller.CoreWebView2()? };
            allow_camera_permission_for_app_origins(&webview)?;
            let mut token = Default::default();
            unsafe {
                webview.add_PermissionRequested(
                    &PermissionRequestedEventHandler::create(Box::new(|_, args| {
                        let Some(args) = args else {
                            return Ok(());
                        };

                        let mut kind = COREWEBVIEW2_PERMISSION_KIND::default();
                        args.PermissionKind(&mut kind)?;
                        if kind == COREWEBVIEW2_PERMISSION_KIND_CAMERA {
                            args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW)?;
                        }

                        Ok(())
                    })),
                    &mut token,
                )?;
            }

            Ok(())
        })();

        fn allow_camera_permission_for_app_origins(
            webview: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2,
        ) -> webview2_com::Result<()> {
            const APP_ORIGINS: &[&str] = &[
                "http://tauri.localhost",
                "https://tauri.localhost",
                "http://localhost:1420",
                "http://127.0.0.1:1420",
            ];

            let webview = webview.cast::<ICoreWebView2_13>()?;
            let profile = unsafe { webview.Profile()? };
            let profile = profile.cast::<ICoreWebView2Profile4>()?;
            for origin in APP_ORIGINS {
                let origin = HSTRING::from(*origin);
                unsafe {
                    profile.SetPermissionState(
                        COREWEBVIEW2_PERMISSION_KIND_CAMERA,
                        &origin,
                        COREWEBVIEW2_PERMISSION_STATE_ALLOW,
                        &SetPermissionStateCompletedHandler::create(Box::new(|_| Ok(()))),
                    )?;
                }
            }

            Ok(())
        }

        if let Err(error) = result {
            eprintln!("failed to install camera permission handler: {error}");
        }
    }) {
        eprintln!("failed to access webview for camera permission handler: {error}");
    }
}

#[cfg(not(windows))]
fn install_camera_permission_handler(_app: &tauri::App) {}

#[tauri::command]
fn get_dashboard(state: tauri::State<AppState>) -> Result<Dashboard, AppError> {
    let settings = state
        .settings
        .lock()
        .map_err(|_| AppError::Message("Failed to read settings".into()))?
        .clone();

    Ok(Dashboard {
        metadata: metadata(&settings.preference_version)?,
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
    let next = settings.clone();
    save_settings(&next)?;
    Ok(next)
}

#[tauri::command]
fn set_uvcd_format(format: String, state: tauri::State<AppState>) -> Result<UvcdResult, AppError> {
    let format = normalize_uvcd_format(&format)?;
    {
        let mut settings = state
            .settings
            .lock()
            .map_err(|_| AppError::Message("Failed to update settings".into()))?;
        settings.uvcd_format = format.clone();
        save_settings(&settings)?;
    }

    match repair_uvcd(&format) {
        Ok(result) => Ok(result),
        Err(error) => Ok(UvcdResult {
            changed: false,
            message: format!("UVC setting saved; {error}"),
            path: None,
            format,
        }),
    }
}

#[tauri::command]
fn set_preference_version(
    version: String,
    state: tauri::State<AppState>,
) -> Result<Dashboard, AppError> {
    let version = normalize_preference_version(&version)?;
    {
        let mut settings = state
            .settings
            .lock()
            .map_err(|_| AppError::Message("Failed to update settings".into()))?;
        settings.preference_version = version;
        save_settings(&settings)?;
    }

    get_dashboard(state)
}

#[tauri::command]
fn reset_settings(state: tauri::State<AppState>) -> Result<SettingsResetResult, AppError> {
    {
        let mut settings = state
            .settings
            .lock()
            .map_err(|_| AppError::Message("Failed to reset settings".into()))?;
        settings.uvcd_format = DEFAULT_UVCD_FORMAT.to_string();
        settings.preference_version = DEFAULT_PREFERENCE_VERSION.to_string();
        save_settings(&settings)?;
    }

    let uvcd = match repair_uvcd(DEFAULT_UVCD_FORMAT) {
        Ok(result) => result,
        Err(error) => UvcdResult {
            changed: false,
            message: format!("Settings reset; {error}"),
            path: None,
            format: DEFAULT_UVCD_FORMAT.to_string(),
        },
    };

    Ok(SettingsResetResult {
        dashboard: get_dashboard(state)?,
        uvcd,
    })
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
fn select_output_folder(
    window: tauri::WebviewWindow,
    state: tauri::State<AppState>,
) -> Result<ActionResult, AppError> {
    let _dialog_guard = match state.native_dialog_lock.try_lock() {
        Ok(guard) => guard,
        Err(std::sync::TryLockError::WouldBlock) => {
            return Err(AppError::Message(
                "A folder selection dialog is already open".into(),
            ));
        }
        Err(std::sync::TryLockError::Poisoned(error)) => error.into_inner(),
    };

    let Some(parent_folder) = rfd::FileDialog::new()
        .set_parent(&window)
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
    if !is_allowed_external_url(&url) {
        return Err(AppError::Message(
            "Only approved HTTPS URLs can be opened".into(),
        ));
    }

    open_in_browser(&url)?;
    Ok(ActionResult {
        ok: true,
        message: "URL opened".into(),
        path: Some(url),
    })
}

fn is_allowed_external_url(url: &str) -> bool {
    let Some(host) = external_url_host(url) else {
        return false;
    };

    ALLOWED_EXTERNAL_URL_HOSTS
        .iter()
        .any(|allowed_host| host.eq_ignore_ascii_case(allowed_host))
}

fn external_url_host(url: &str) -> Option<&str> {
    let (scheme, rest) = url.split_once("://")?;
    if !scheme.eq_ignore_ascii_case("https") {
        return None;
    }

    let authority_end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
    let authority = &rest[..authority_end];
    if authority.is_empty() || authority.contains('@') || authority.starts_with('[') {
        return None;
    }

    let host = if let Some((host, port)) = authority.rsplit_once(':') {
        if host.is_empty() || port.is_empty() || !port.bytes().all(|byte| byte.is_ascii_digit()) {
            return None;
        }

        host
    } else {
        authority
    };

    if host.is_empty() || host.ends_with('.') || host.contains(':') {
        return None;
    }

    Some(host)
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
                "gesture_recognition/yolov7_tiny.nb",
                "yolov7_tiny.nb",
                "Save hand tracking weight",
            ),
        ],
    )
}

#[tauri::command]
fn save_object_detection_box_resources_as(app: AppHandle) -> Result<ActionResult, AppError> {
    save_resource_set_as(
        &app,
        &[
            (
                "object_detection_box/code.txt",
                "code.txt",
                "Save AMB box tracking code",
            ),
            (
                "object_detection_box/yolov7_tiny.nb",
                "yolov7_tiny.nb",
                "Save AMB box tracking weight",
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
fn save_image_model_singapore_as(app: AppHandle) -> Result<ActionResult, AppError> {
    save_one_resource_as(
        &app,
        "image_classification_singapore/img_class_cnn.nb",
        "img_class_cnn.nb",
        "Save image classification weight",
    )
}

#[tauri::command]
fn download_arduino_ide_as(app: AppHandle) -> Result<DownloadResult, AppError> {
    let manifest = endpoint_manifest()?;
    download_url_as(
        &app,
        "arduino",
        &manifest.downloads.arduino_ide.urls,
        "Save Arduino IDE installer",
    )
}

#[tauri::command]
fn download_and_install_arduino_ide(app: AppHandle) -> Result<DownloadResult, AppError> {
    if !has_internet() {
        return Err(AppError::Message(
            "Internet connection is not available".into(),
        ));
    }

    let manifest = endpoint_manifest()?;
    let urls = &manifest.downloads.arduino_ide_msi.urls;
    let file_name = file_name_from_url(first_url(urls)?)?;
    let target = std::env::temp_dir().join(file_name);
    let result = download_to_path_with_fallback(&app, "arduino", urls, &target)?;
    install_msi(&target)?;
    Ok(result)
}

#[tauri::command]
fn download_vlc_as(app: AppHandle) -> Result<DownloadResult, AppError> {
    let manifest = endpoint_manifest()?;
    download_url_as(
        &app,
        "vlc",
        &manifest.downloads.vlc.urls,
        "Save VLC installer",
    )
}

#[tauri::command]
fn download_and_install_vlc(app: AppHandle) -> Result<DownloadResult, AppError> {
    if !has_internet() {
        return Err(AppError::Message(
            "Internet connection is not available".into(),
        ));
    }

    let manifest = endpoint_manifest()?;
    let urls = &manifest.downloads.vlc.urls;
    let file_name = file_name_from_url(first_url(urls)?)?;
    let target = std::env::temp_dir().join(file_name);
    let result = download_to_path_with_fallback(&app, "vlc", urls, &target)?;
    install_exe_silent(&target)?;
    Ok(result)
}

#[tauri::command]
fn download_model_conversion_as(
    app: AppHandle,
    url: String,
    file_name: String,
) -> Result<DownloadResult, AppError> {
    let manifest = endpoint_manifest()?;
    let allowed_prefix = format!("{}/conversions/", manifest.model_converter.api_base);
    if !url.starts_with(&allowed_prefix) || !url.ends_with("/download") {
        return Err(AppError::Message(
            "Only model converter download URLs are allowed".into(),
        ));
    }

    let default_name = safe_file_name(&file_name);
    let target = save_dialog(&default_name, "Save converted model")
        .ok_or_else(|| AppError::Message("Save was canceled".into()))?;
    download_to_path(&app, "converter", &url, &target)
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

    let manifest = endpoint_manifest()?;
    let remote = get_text_with_fallback(&manifest.version_check.urls)?
        .trim()
        .to_string();

    let local = app_version();
    let ordering = compare_version_numbers(local, &remote).unwrap_or_else(|| {
        if remote == local {
            Ordering::Equal
        } else {
            Ordering::Less
        }
    });

    Ok(VersionCheck {
        local: local.to_string(),
        is_latest: ordering == Ordering::Equal,
        is_beta: ordering == Ordering::Greater,
        remote,
        repository: manifest.repository,
    })
}

#[tauri::command]
fn save_capture_image(
    bytes: Vec<u8>,
    state: tauri::State<AppState>,
) -> Result<ActionResult, AppError> {
    let _capture_guard = state
        .capture_lock
        .lock()
        .map_err(|_| AppError::Message("Failed to lock camera capture storage".into()))?;
    let folder = output_dir(&state)?;
    fs::create_dir_all(&folder)?;
    let file_path = write_next_image(&folder, &bytes)?;

    Ok(ActionResult {
        ok: true,
        message: "Image saved".into(),
        path: Some(display_path(file_path)),
    })
}

#[tauri::command]
fn select_annotation_folder() -> Result<AnnotationWorkspace, AppError> {
    let Some(folder) = rfd::FileDialog::new()
        .set_title("Select image folder")
        .pick_folder()
    else {
        return Err(AppError::Message("Folder selection was canceled".into()));
    };

    load_annotation_workspace(&folder)
}

#[tauri::command]
fn load_annotation_folder(path: String) -> Result<AnnotationWorkspace, AppError> {
    let path = PathBuf::from(path);
    let folder = if path.is_file() {
        path.parent()
            .map(Path::to_path_buf)
            .ok_or_else(|| AppError::Message("Image folder does not exist".into()))?
    } else {
        path
    };
    load_annotation_workspace(&folder)
}

#[tauri::command]
fn read_annotation_image(path: String) -> Result<AnnotationImageData, AppError> {
    let path = Path::new(&path);
    if !path.is_file() || !is_supported_image(path) {
        return Err(AppError::Message("Unsupported image file".into()));
    }

    Ok(AnnotationImageData {
        mime: image_mime(path).to_string(),
        bytes: fs::read(path)?,
    })
}

#[tauri::command]
fn save_annotation_classes(
    labels_folder: String,
    classes: Vec<String>,
) -> Result<AnnotationSaveResult, AppError> {
    validate_class_names(&classes)?;
    let labels_folder = PathBuf::from(labels_folder);
    fs::create_dir_all(&labels_folder)?;
    let path = labels_folder.join("classes.txt");
    write_classes_file(&path, &classes)?;

    Ok(AnnotationSaveResult {
        path: display_path(path),
        count: classes.len(),
    })
}

#[tauri::command]
fn save_annotation_file(
    labels_folder: String,
    image_file_name: String,
    annotations: Vec<AnnotationBox>,
) -> Result<AnnotationSaveResult, AppError> {
    let labels_folder = PathBuf::from(labels_folder);
    fs::create_dir_all(&labels_folder)?;
    let path = label_path_for_image(&labels_folder, &image_file_name)?;
    write_annotation_file(&path, &annotations)?;

    Ok(AnnotationSaveResult {
        path: display_path(path),
        count: annotations.len(),
    })
}

#[tauri::command]
fn save_annotation_workspace(
    labels_folder: String,
    classes: Vec<String>,
    annotations: HashMap<String, Vec<AnnotationBox>>,
) -> Result<AnnotationSaveResult, AppError> {
    validate_class_names(&classes)?;
    let labels_folder = PathBuf::from(labels_folder);
    fs::create_dir_all(&labels_folder)?;
    write_classes_file(&labels_folder.join("classes.txt"), &classes)?;

    let mut count = 0_usize;
    for (image_file_name, boxes) in annotations {
        let path = label_path_for_image(&labels_folder, &image_file_name)?;
        write_annotation_file(&path, &boxes)?;
        count += boxes.len();
    }

    Ok(AnnotationSaveResult {
        path: display_path(labels_folder),
        count,
    })
}

fn metadata(preference_version: &str) -> Result<Metadata, AppError> {
    let manifest = endpoint_manifest()?;
    Ok(Metadata {
        author: AUTHOR,
        contact: CONTACT,
        version: app_version(),
        repository: manifest.repository,
        arduino_ide_url: first_url(&manifest.downloads.arduino_ide.urls)?.to_string(),
        vlc_url: first_url(&manifest.downloads.vlc.urls)?.to_string(),
        realtek_package_url: preference_url(preference_version)?,
        model_converter_url: manifest.model_converter.site_url,
        model_converter_api_base: manifest.model_converter.api_base,
        supported_languages: vec!["zh_TW", "en_US", "ja_JP"],
    })
}

fn load_annotation_workspace(folder: &Path) -> Result<AnnotationWorkspace, AppError> {
    if !folder.is_dir() {
        return Err(AppError::Message(format!(
            "Image folder does not exist: {}",
            display_path(folder)
        )));
    }

    let labels_folder = annotation_labels_folder(folder)?;
    fs::create_dir_all(&labels_folder)?;
    let classes = read_classes_file(&labels_folder.join("classes.txt"))?;

    let mut annotations = HashMap::new();
    let mut invalid_class_ids = BTreeSet::new();
    let mut images = Vec::new();

    let mut image_paths: Vec<PathBuf> = fs::read_dir(folder)?
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.is_file() && is_supported_image(path))
        .collect();
    image_paths.sort_by_key(|path| {
        path.file_name()
            .map(|name| name.to_string_lossy().to_ascii_lowercase())
            .unwrap_or_default()
    });

    for image_path in image_paths {
        let Some(file_name) = image_path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
        else {
            continue;
        };
        let label_path = label_path_for_image(&labels_folder, &file_name)?;
        let boxes = read_annotation_file(&label_path)?;

        for item in &boxes {
            if item.class_id >= classes.len() {
                invalid_class_ids.insert(item.class_id);
            }
        }

        images.push(AnnotationImage {
            name: file_name.clone(),
            path: display_path(&image_path),
            annotation_count: boxes.len(),
        });
        annotations.insert(file_name, boxes);
    }

    Ok(AnnotationWorkspace {
        image_folder: display_path(folder),
        labels_folder: display_path(labels_folder),
        images,
        classes,
        annotations,
        invalid_class_ids: invalid_class_ids.into_iter().collect(),
    })
}

fn annotation_labels_folder(folder: &Path) -> Result<PathBuf, AppError> {
    let parent = folder.parent().unwrap_or_else(|| Path::new("."));
    let folder_name = folder
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.trim().is_empty())
        .unwrap_or("images");
    Ok(parent.join(format!("{folder_name}_labels")))
}

fn is_supported_image(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| {
            matches!(
                ext.to_ascii_lowercase().as_str(),
                "jpg" | "jpeg" | "png" | "bmp"
            )
        })
        .unwrap_or(false)
}

fn image_mime(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        Some("bmp") => "image/bmp",
        _ => "image/jpeg",
    }
}

fn read_classes_file(path: &Path) -> Result<Vec<String>, AppError> {
    if !path.exists() {
        return Ok(Vec::new());
    }

    Ok(fs::read_to_string(path)?
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
        .collect())
}

fn write_classes_file(path: &Path, classes: &[String]) -> Result<(), AppError> {
    let content = if classes.is_empty() {
        String::new()
    } else {
        format!("{}\n", classes.join("\n"))
    };
    fs::write(path, content)?;
    Ok(())
}

fn read_annotation_file(path: &Path) -> Result<Vec<AnnotationBox>, AppError> {
    if !path.exists() {
        return Ok(Vec::new());
    }

    let mut boxes = Vec::new();
    for (line_index, line) in fs::read_to_string(path)?.lines().enumerate() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() != 5 {
            return Err(AppError::Message(format!(
                "Invalid YOLO annotation at {}:{}",
                display_path(path),
                line_index + 1
            )));
        }

        let class_id = parts[0].parse::<usize>().map_err(|_| {
            AppError::Message(format!(
                "Invalid class id at {}:{}",
                display_path(path),
                line_index + 1
            ))
        })?;
        let values = [
            parse_normalized(parts[1], path, line_index + 1)?,
            parse_normalized(parts[2], path, line_index + 1)?,
            parse_normalized(parts[3], path, line_index + 1)?,
            parse_normalized(parts[4], path, line_index + 1)?,
        ];
        boxes.push(AnnotationBox {
            class_id,
            x_center: values[0],
            y_center: values[1],
            width: values[2],
            height: values[3],
        });
    }

    Ok(boxes)
}

fn parse_normalized(value: &str, path: &Path, line: usize) -> Result<f64, AppError> {
    let number = value.parse::<f64>().map_err(|_| {
        AppError::Message(format!(
            "Invalid annotation number at {}:{}",
            display_path(path),
            line
        ))
    })?;

    if (0.0..=1.0).contains(&number) {
        Ok(number)
    } else {
        Err(AppError::Message(format!(
            "Annotation value must be normalized at {}:{}",
            display_path(path),
            line
        )))
    }
}

fn write_annotation_file(path: &Path, boxes: &[AnnotationBox]) -> Result<(), AppError> {
    let mut content = String::new();
    for item in boxes {
        content.push_str(&format!(
            "{} {:.6} {:.6} {:.6} {:.6}\n",
            item.class_id,
            clamp_normalized(item.x_center),
            clamp_normalized(item.y_center),
            clamp_normalized(item.width),
            clamp_normalized(item.height)
        ));
    }
    fs::write(path, content)?;
    Ok(())
}

fn clamp_normalized(value: f64) -> f64 {
    value.clamp(0.0, 1.0)
}

fn label_path_for_image(labels_folder: &Path, image_file_name: &str) -> Result<PathBuf, AppError> {
    let file_name = Path::new(image_file_name)
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| AppError::Message("Invalid image file name".into()))?;
    let stem = Path::new(file_name)
        .file_stem()
        .and_then(|name| name.to_str())
        .ok_or_else(|| AppError::Message("Invalid image file name".into()))?;

    Ok(labels_folder.join(format!("{stem}.txt")))
}

fn validate_class_names(classes: &[String]) -> Result<(), AppError> {
    let re = Regex::new(r"^[A-Za-z0-9]+$").map_err(|error| AppError::Message(error.to_string()))?;
    for name in classes {
        if !re.is_match(name) {
            return Err(AppError::Message(
                "Class names can only contain English letters and numbers".into(),
            ));
        }
    }
    Ok(())
}

fn start_uvcd_worker(app: AppHandle) {
    thread::spawn(move || loop {
        let format = current_uvcd_format(&app).unwrap_or_else(|_| DEFAULT_UVCD_FORMAT.to_string());
        match repair_uvcd(&format) {
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
    urls: &[String],
    title: &str,
) -> Result<DownloadResult, AppError> {
    if !has_internet() {
        return Err(AppError::Message(
            "Internet connection is not available".into(),
        ));
    }

    let file_name = file_name_from_url(first_url(urls)?)?;
    let target = save_dialog(file_name, title)
        .ok_or_else(|| AppError::Message("Save was canceled".into()))?;
    download_to_path_with_fallback(app, key, urls, &target)
}

fn download_to_path_with_fallback(
    app: &AppHandle,
    key: &'static str,
    urls: &[String],
    target: &Path,
) -> Result<DownloadResult, AppError> {
    let mut errors = Vec::new();

    for url in urls {
        match download_to_path(app, key, url, target) {
            Ok(result) => return Ok(result),
            Err(error) => errors.push(format!("{url}: {error}")),
        }
    }

    Err(AppError::Message(format!(
        "All download URLs failed: {}",
        errors.join("; ")
    )))
}

fn download_to_path(
    app: &AppHandle,
    key: &'static str,
    url: &str,
    target: &Path,
) -> Result<DownloadResult, AppError> {
    let response = http_agent()
        .get(url)
        .set("Accept-Encoding", "identity")
        .call()
        .map_err(http_error)?;
    let total = response
        .header("content-length")
        .and_then(|value| value.parse::<u64>().ok());
    let (temporary_path, mut file) = create_download_temp_file(target)?;
    let mut reader = response.into_reader();
    let mut buffer = [0_u8; 64 * 1024];
    let mut bytes = 0_u64;
    let mut last_emit = 0_u64;

    emit_download_progress(app, key, bytes, total);
    let transfer_result = (|| -> Result<(), AppError> {
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
        file.sync_all()?;
        validate_download_length(bytes, total)
    })();
    drop(file);

    if let Err(error) = transfer_result {
        let _ = fs::remove_file(&temporary_path);
        return Err(error);
    }

    if let Err(error) = replace_downloaded_file(&temporary_path, target) {
        let _ = fs::remove_file(&temporary_path);
        return Err(error);
    }

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

fn validate_download_length(bytes: u64, total: Option<u64>) -> Result<(), AppError> {
    if let Some(expected) = total {
        if bytes != expected {
            return Err(AppError::Message(format!(
                "Downloaded file is incomplete: expected {expected} bytes, received {bytes} bytes"
            )));
        }
    }
    Ok(())
}

fn create_download_temp_file(target: &Path) -> Result<(PathBuf, fs::File), AppError> {
    let parent = target
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let file_name = target
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("download");
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();

    for attempt in 0..100_u32 {
        let path = parent.join(format!(
            ".{file_name}.{}.{}.{attempt}.part",
            std::process::id(),
            nonce
        ));
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
        {
            Ok(file) => return Ok((path, file)),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.into()),
        }
    }

    Err(AppError::Message(
        "Failed to create a unique temporary download file".into(),
    ))
}

#[cfg(windows)]
fn replace_downloaded_file(source: &Path, target: &Path) -> Result<(), AppError> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    let source_wide: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let target_wide: Vec<u16> = target.as_os_str().encode_wide().chain(Some(0)).collect();
    let result = unsafe {
        MoveFileExW(
            source_wide.as_ptr(),
            target_wide.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };

    if result == 0 {
        return Err(std::io::Error::last_os_error().into());
    }
    Ok(())
}

#[cfg(not(windows))]
fn replace_downloaded_file(source: &Path, target: &Path) -> Result<(), AppError> {
    fs::rename(source, target)?;
    Ok(())
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

fn safe_file_name(file_name: &str) -> String {
    Path::new(file_name)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.trim().is_empty())
        .unwrap_or("converted_model.nb")
        .to_string()
}

fn app_version() -> &'static str {
    VERSION_TEXT.trim()
}

fn app_user_agent() -> String {
    format!("AMB82-Mini-Computer-Plugin/{}", app_version())
}

fn endpoint_manifest() -> Result<EndpointManifest, AppError> {
    serde_json::from_str(ENDPOINT_MANIFEST_JSON)
        .map_err(|error| AppError::Message(format!("Endpoint manifest error: {error}")))
}

fn first_url(urls: &[String]) -> Result<&str, AppError> {
    urls.first()
        .map(String::as_str)
        .filter(|url| !url.trim().is_empty())
        .ok_or_else(|| AppError::Message("Endpoint manifest does not include a URL".into()))
}

fn get_text_with_fallback(urls: &[String]) -> Result<String, AppError> {
    let mut errors = Vec::new();

    for url in urls {
        match http_agent()
            .get(url)
            .call()
            .map_err(http_error)
            .and_then(|response| {
                response
                    .into_string()
                    .map_err(|error| AppError::Message(format!("HTTP read error: {error}")))
            }) {
            Ok(text) => return Ok(text),
            Err(error) => errors.push(format!("{url}: {error}")),
        }
    }

    Err(AppError::Message(format!(
        "All endpoint URLs failed: {}",
        errors.join("; ")
    )))
}

fn http_agent() -> ureq::Agent {
    let user_agent = app_user_agent();
    ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(120))
        .timeout_connect(Duration::from_secs(20))
        .user_agent(&user_agent)
        .build()
}

fn internet_agent() -> ureq::Agent {
    let user_agent = app_user_agent();
    ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(3))
        .timeout_connect(Duration::from_secs(2))
        .user_agent(&user_agent)
        .build()
}

fn has_internet() -> bool {
    let Ok(manifest) = endpoint_manifest() else {
        return false;
    };

    manifest
        .internet_check_urls
        .iter()
        .any(|url| internet_agent().get(url).call().is_ok())
}

fn http_error(error: ureq::Error) -> AppError {
    AppError::Message(format!("HTTP error: {error}"))
}

fn current_uvcd_format(app: &AppHandle) -> Result<String, AppError> {
    let state = app.state::<AppState>();
    let settings = state
        .settings
        .lock()
        .map_err(|_| AppError::Message("Failed to read settings".into()))?;
    normalize_uvcd_format(&settings.uvcd_format)
}

fn normalize_uvcd_format(format: &str) -> Result<String, AppError> {
    let normalized = format.trim().to_ascii_uppercase();

    if SUPPORTED_UVCD_FORMATS.contains(&normalized.as_str()) {
        Ok(normalized)
    } else {
        Err(AppError::Message(format!(
            "Unsupported UVC device format: {format}"
        )))
    }
}

fn normalize_preference_version(version: &str) -> Result<String, AppError> {
    let normalized = version.trim().to_ascii_lowercase();

    if SUPPORTED_PREFERENCE_VERSIONS.contains(&normalized.as_str()) {
        Ok(normalized)
    } else {
        Err(AppError::Message(format!(
            "Unsupported preference version: {version}"
        )))
    }
}

fn preference_url(version: &str) -> Result<String, AppError> {
    let manifest = endpoint_manifest()?;
    let urls = if version == "release" {
        &manifest.realtek_packages.release.urls
    } else {
        &manifest.realtek_packages.beta.urls
    };

    Ok(first_url(urls)?.to_string())
}

fn compare_version_numbers(local: &str, remote: &str) -> Option<Ordering> {
    let local = version_numbers(local)?;
    let remote = version_numbers(remote)?;

    for (local_part, remote_part) in local.iter().zip(remote.iter()) {
        match local_part.cmp(remote_part) {
            Ordering::Equal => continue,
            ordering => return Some(ordering),
        }
    }

    Some(Ordering::Equal)
}

fn version_numbers(version: &str) -> Option<[u64; 3]> {
    let normalized = version.trim().trim_start_matches(['v', 'V']);
    let mut numbers = [0_u64; 3];
    let mut parts = normalized.split('.');

    for number in &mut numbers {
        let part = parts.next()?;
        let digits: String = part
            .chars()
            .take_while(|character| character.is_ascii_digit())
            .collect();
        if digits.is_empty() {
            return None;
        }
        *number = digits.parse().ok()?;
    }

    Some(numbers)
}

fn load_settings() -> Result<Settings, AppError> {
    let path = settings_path()?;
    if !path.exists() {
        return Ok(Settings::default());
    }

    let content = fs::read_to_string(path)?;
    let mut settings: Settings = serde_json::from_str(&content)
        .map_err(|error| AppError::Message(format!("Settings file error: {error}")))?;
    settings.uvcd_format = normalize_uvcd_format(&settings.uvcd_format)?;
    settings.preference_version = normalize_preference_version(&settings.preference_version)?;
    Ok(settings)
}

fn save_settings(settings: &Settings) -> Result<(), AppError> {
    let path = settings_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let content = serde_json::to_string_pretty(settings)
        .map_err(|error| AppError::Message(format!("Settings file error: {error}")))?;
    fs::write(path, content)?;
    Ok(())
}

fn settings_path() -> Result<PathBuf, AppError> {
    let base = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or(std::env::current_dir()?);
    Ok(base
        .join("AMB82 Mini Computer Plugin")
        .join("settings.json"))
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

fn repair_uvcd(format: &str) -> Result<UvcdResult, AppError> {
    let format = normalize_uvcd_format(format)?;
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
    let repaired = repair_uvcd_content(&original, &format)?;
    let changed = repaired != original;

    if changed {
        fs::write(&target, repaired)?;
    }

    Ok(UvcdResult {
        changed,
        message: if changed {
            format!("UVCD_pram.h repaired for {format}")
        } else {
            format!("UVCD_pram.h already matches {format}")
        },
        path: Some(display_path(target)),
        format,
    })
}

fn repair_uvcd_content(original: &str, format: &str) -> Result<String, AppError> {
    let format = normalize_uvcd_format(format)?;
    let enabled_define = format!("UVCD_{format}");
    let re = Regex::new(r"(?m)^(#define\s+)(UVCD_[A-Za-z0-9_]+)(\s+)\d+")
        .map_err(|error| AppError::Message(error.to_string()))?;
    Ok(re
        .replace_all(original, |captures: &regex::Captures<'_>| {
            if &captures[2] == enabled_define.as_str() {
                format!("{}{}{}1", &captures[1], &captures[2], &captures[3])
            } else {
                format!("{}{}{}0", &captures[1], &captures[2], &captures[3])
            }
        })
        .to_string())
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

fn write_next_image(folder: &Path, bytes: &[u8]) -> Result<PathBuf, AppError> {
    for _ in 0..100 {
        let file_path = next_image_path(folder)?;
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&file_path)
        {
            Ok(mut file) => {
                if let Err(error) = file.write_all(bytes).and_then(|_| file.flush()) {
                    drop(file);
                    let _ = fs::remove_file(&file_path);
                    return Err(error.into());
                }
                return Ok(file_path);
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.into()),
        }
    }

    Err(AppError::Message(
        "Failed to reserve a unique camera capture file name".into(),
    ))
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

fn install_msi(path: &Path) -> Result<(), AppError> {
    #[cfg(target_os = "windows")]
    {
        let parameters = format!("/i \"{}\" /passive", display_path(path));
        launch_elevated("msiexec.exe", &parameters)
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = path;
        Err(AppError::Message(
            "MSI installation is only supported on Windows".into(),
        ))
    }
}

fn install_exe_silent(path: &Path) -> Result<(), AppError> {
    #[cfg(target_os = "windows")]
    {
        launch_elevated(path, "/S")
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = path;
        Err(AppError::Message(
            "EXE installation is only supported on Windows".into(),
        ))
    }
}

#[cfg(target_os = "windows")]
fn launch_elevated(file: impl AsRef<std::ffi::OsStr>, parameters: &str) -> Result<(), AppError> {
    use std::os::windows::ffi::OsStrExt;
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::UI::Shell::ShellExecuteW;
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    fn wide(value: impl AsRef<std::ffi::OsStr>) -> Vec<u16> {
        value.as_ref().encode_wide().chain(Some(0)).collect()
    }

    let operation = wide("runas");
    let file = wide(file);
    let parameters = wide(parameters);
    let result = unsafe {
        ShellExecuteW(
            null_mut(),
            operation.as_ptr(),
            file.as_ptr(),
            parameters.as_ptr(),
            null(),
            SW_SHOWNORMAL,
        )
    } as isize;

    if result <= 32 {
        return Err(AppError::Message(format!(
            "Failed to launch installer with administrator permission (ShellExecuteW code {result})"
        )));
    }

    Ok(())
}

fn display_path(path: impl AsRef<Path>) -> String {
    path.as_ref().to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_directory(name: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        std::env::temp_dir().join(format!("amb82-{name}-{}-{nonce}", std::process::id()))
    }

    #[test]
    fn repair_uvcd_content_enables_mjpg_and_disables_other_uvcd_formats() {
        let original = "\
#define VIDEO_FHD_WIDTH_UVCD  1920
#define UVCD_YUY2 1
#define UVCD_NV12 1
#define UVCD_MJPG 1
#define UVCD_H264 1
#define UVCD_H265 1
";

        let repaired = repair_uvcd_content(original, "MJPG").expect("uvcd content should repair");

        assert!(repaired.contains("#define VIDEO_FHD_WIDTH_UVCD  1920"));
        assert!(repaired.contains("#define UVCD_YUY2 0"));
        assert!(repaired.contains("#define UVCD_NV12 0"));
        assert!(repaired.contains("#define UVCD_MJPG 1"));
        assert!(repaired.contains("#define UVCD_H264 0"));
        assert!(repaired.contains("#define UVCD_H265 0"));
    }

    #[test]
    fn repair_uvcd_content_enables_selected_format() {
        let original = "\
#define UVCD_YUY2 1
#define UVCD_NV12 1
#define UVCD_MJPG 1
#define UVCD_H264 0
#define UVCD_H265 0
";

        let repaired = repair_uvcd_content(original, "H264").expect("uvcd content should repair");

        assert!(repaired.contains("#define UVCD_YUY2 0"));
        assert!(repaired.contains("#define UVCD_NV12 0"));
        assert!(repaired.contains("#define UVCD_MJPG 0"));
        assert!(repaired.contains("#define UVCD_H264 1"));
        assert!(repaired.contains("#define UVCD_H265 0"));
    }

    #[test]
    fn normalize_uvcd_format_accepts_yuy2() {
        assert_eq!(normalize_uvcd_format("YUY2").unwrap(), "YUY2");
    }

    #[test]
    fn preference_url_uses_beta_by_default_and_release_when_selected() {
        assert_eq!(
            preference_url(DEFAULT_PREFERENCE_VERSION).unwrap(),
            "https://github.com/Ameba-AIoT/ameba-arduino-pro2/raw/dev/Arduino_package/package_realtek_amebapro2_early_index.json"
        );
        assert_eq!(
            preference_url("release").unwrap(),
            "https://github.com/ambiot/ambpro2_arduino/raw/main/Arduino_package/package_realtek_amebapro2_index.json"
        );
    }

    #[test]
    fn external_url_allow_list_accepts_expected_https_hosts() {
        let urls = [
            "https://github.com/breeze0305/Realtek_AMB82mini_plugin",
            "https://raw.githubusercontent.com/breeze0305/Realtek_AMB82mini_plugin/main/version.txt",
            "https://downloads.arduino.cc/arduino-ide/arduino-ide_2.3.8_Windows_64bit.exe",
            "https://get.videolan.org/vlc/3.0.23/win32/vlc-3.0.23-win32.exe",
            "https://mirror.twds.com.tw/videolan/vlc/3.0.23/win32/vlc-3.0.23-win32.exe",
            "https://modelconverter.ntnu-aiot.com/api/v1/conversions/123/download",
        ];

        for url in urls {
            assert!(is_allowed_external_url(url), "{url} should be allowed");
        }
    }

    #[test]
    fn external_url_allow_list_rejects_http() {
        assert!(!is_allowed_external_url("http://github.com/breeze0305"));
    }

    #[test]
    fn external_url_allow_list_rejects_similar_malicious_hosts() {
        let urls = [
            "https://github.com.evil.com/breeze0305",
            "https://raw.githubusercontent.com.evil.com/version.txt",
            "https://downloads.arduino.cc.evil.com/arduino.exe",
            "https://github.com@evil.com/breeze0305",
        ];

        for url in urls {
            assert!(!is_allowed_external_url(url), "{url} should be rejected");
        }
    }

    #[test]
    fn external_url_allow_list_rejects_invalid_urls() {
        let urls = [
            "",
            "not a url",
            "https://",
            "https:///path",
            "https://github.com.",
            "https://github.com:bad/path",
            "https://[::1]/",
        ];

        for url in urls {
            assert!(!is_allowed_external_url(url), "{url} should be rejected");
        }
    }

    #[test]
    fn compare_version_numbers_checks_major_minor_then_patch() {
        assert_eq!(
            compare_version_numbers("3.9.1", "3.8.0"),
            Some(Ordering::Greater)
        );
        assert_eq!(
            compare_version_numbers("3.9.1", "3.10.0"),
            Some(Ordering::Less)
        );
        assert_eq!(
            compare_version_numbers("4.0.0", "3.9.9"),
            Some(Ordering::Greater)
        );
        assert_eq!(
            compare_version_numbers("3.9.1", "3.9.1"),
            Some(Ordering::Equal)
        );
    }

    #[test]
    fn safe_file_name_strips_parent_paths() {
        assert_eq!(safe_file_name("../model.nb"), "model.nb");
        assert_eq!(safe_file_name(""), "converted_model.nb");
    }

    #[test]
    fn download_length_validation_rejects_incomplete_files() {
        assert!(validate_download_length(512, Some(512)).is_ok());
        assert!(validate_download_length(512, None).is_ok());
        assert!(validate_download_length(511, Some(512)).is_err());
        assert!(validate_download_length(513, Some(512)).is_err());
    }

    #[test]
    fn completed_download_replaces_the_target_file() {
        let folder = test_directory("download-replace");
        fs::create_dir_all(&folder).unwrap();
        let source = folder.join("payload.part");
        let target = folder.join("payload.bin");
        fs::write(&source, b"new payload").unwrap();
        fs::write(&target, b"old payload").unwrap();

        replace_downloaded_file(&source, &target).unwrap();

        assert_eq!(fs::read(&target).unwrap(), b"new payload");
        assert!(!source.exists());
        fs::remove_dir_all(folder).unwrap();
    }

    #[test]
    fn camera_capture_uses_the_next_available_file_without_overwriting() {
        let folder = test_directory("capture-file");
        fs::create_dir_all(&folder).unwrap();
        let first = folder.join("image_00001.jpg");
        fs::write(&first, b"existing image").unwrap();

        let second = write_next_image(&folder, b"new image").unwrap();

        assert_eq!(second.file_name().unwrap(), "image_00002.jpg");
        assert_eq!(fs::read(first).unwrap(), b"existing image");
        assert_eq!(fs::read(second).unwrap(), b"new image");
        fs::remove_dir_all(folder).unwrap();
    }
}
