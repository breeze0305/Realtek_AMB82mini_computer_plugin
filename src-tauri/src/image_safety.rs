use super::{display_path, AppError};
use std::{
    fs::{self, File, Metadata, OpenOptions},
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

pub(super) const MAX_IMAGE_DIMENSION: u32 = 16_384;
pub(super) const MAX_IMAGE_PIXELS: u64 = 64 * 1024 * 1024;
pub(super) const MAX_SOURCE_BYTES: u64 = 512 * 1024 * 1024;

/// Holds a read handle whose Windows share flags prevent any writer from
/// opening the source until the caller finishes publishing its replacement.
pub(super) struct LockedImageSource {
    guard: ImageSourceGuard,
    bytes: Vec<u8>,
}

pub(super) struct ImageSourceGuard {
    file: File,
    current_path: PathBuf,
}

impl LockedImageSource {
    pub(super) fn open(path: &Path) -> Result<Self, AppError> {
        let mut options = OpenOptions::new();
        options.read(true);

        #[cfg(windows)]
        {
            use std::os::windows::fs::OpenOptionsExt;
            use windows_sys::Win32::{
                Foundation::GENERIC_READ,
                Storage::FileSystem::{DELETE, FILE_FLAG_OPEN_REPARSE_POINT, FILE_SHARE_READ},
            };

            options
                .access_mode(GENERIC_READ | DELETE)
                .share_mode(FILE_SHARE_READ)
                .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT);
        }

        let mut file = options.open(path)?;
        let metadata = file.metadata()?;
        if metadata_is_reparse_point(&metadata) || !metadata.is_file() {
            return Err(AppError::Message(format!(
                "Image source is not a regular file: {}",
                display_path(path)
            )));
        }
        validate_source_length(path, metadata.len())?;

        let capacity = usize::try_from(metadata.len()).map_err(|_| {
            AppError::Message(format!(
                "Image size cannot be represented on this system: {}",
                display_path(path)
            ))
        })?;
        let mut bytes = Vec::with_capacity(capacity);
        file.read_to_end(&mut bytes)?;
        if bytes.len() as u64 != metadata.len() {
            return Err(AppError::Message(format!(
                "Image size changed while it was being opened: {}",
                display_path(path)
            )));
        }

        Ok(Self {
            guard: ImageSourceGuard {
                file,
                current_path: absolute_path(path)?,
            },
            bytes,
        })
    }

    pub(super) fn into_parts(self) -> (ImageSourceGuard, Vec<u8>) {
        (self.guard, self.bytes)
    }
}

impl ImageSourceGuard {
    pub(super) fn path(&self) -> &Path {
        &self.current_path
    }

    pub(super) fn file_mut(&mut self) -> &mut File {
        &mut self.file
    }

    pub(super) fn read_all_from_start(&mut self) -> Result<Vec<u8>, AppError> {
        self.file.seek(SeekFrom::Start(0))?;
        let mut bytes = Vec::new();
        self.file.read_to_end(&mut bytes)?;
        Ok(bytes)
    }

    pub(super) fn rename_exact(&mut self, target: &Path) -> std::io::Result<()> {
        let target = absolute_path(target)?;
        rename_open_file(&self.file, &self.current_path, &target)?;
        self.current_path = target;
        Ok(())
    }

    pub(super) fn mark_delete(&mut self) -> std::io::Result<()> {
        mark_open_file_for_deletion(&self.file, &self.current_path)
    }
}

pub(super) fn create_locked_temporary_image(target: &Path) -> Result<ImageSourceGuard, AppError> {
    let parent = target
        .parent()
        .ok_or_else(|| AppError::Message("Temporary image has no parent directory".into()))?;
    let file_name = target
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| "image".into());
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
        let mut options = OpenOptions::new();
        options.read(true).write(true).create_new(true);

        #[cfg(windows)]
        {
            use std::os::windows::fs::OpenOptionsExt;
            use windows_sys::Win32::{
                Foundation::{GENERIC_READ, GENERIC_WRITE},
                Storage::FileSystem::{DELETE, FILE_FLAG_OPEN_REPARSE_POINT, FILE_SHARE_READ},
            };

            options
                .access_mode(GENERIC_READ | GENERIC_WRITE | DELETE)
                .share_mode(FILE_SHARE_READ)
                .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT);
        }

        match options.open(&path) {
            Ok(file) => {
                return Ok(ImageSourceGuard {
                    file,
                    current_path: absolute_path(&path)?,
                });
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.into()),
        }
    }

    Err(AppError::Message(
        "Failed to create a unique temporary image file".into(),
    ))
}

pub(super) fn rename_to_unique_sibling(
    guard: &mut ImageSourceGuard,
    anchor: &Path,
    label: &str,
) -> Result<PathBuf, AppError> {
    let parent = anchor
        .parent()
        .ok_or_else(|| AppError::Message("Image recovery path has no parent directory".into()))?;
    let file_name = anchor
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| "image".into());
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();

    for attempt in 0..100_u32 {
        let path = parent.join(format!(
            ".{file_name}.{}.{}.{attempt}.{label}",
            std::process::id(),
            nonce
        ));
        match guard.rename_exact(&path) {
            Ok(()) => return Ok(absolute_path(&path)?),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.into()),
        }
    }

    Err(AppError::Message(format!(
        "Failed to create a unique {label} path for {}",
        display_path(anchor)
    )))
}

fn absolute_path(path: &Path) -> std::io::Result<PathBuf> {
    if path.is_absolute() {
        Ok(path.to_path_buf())
    } else {
        Ok(std::env::current_dir()?.join(path))
    }
}

#[cfg(windows)]
fn rename_open_file(file: &File, _current: &Path, target: &Path) -> std::io::Result<()> {
    use std::{mem, os::windows::ffi::OsStrExt, os::windows::io::AsRawHandle};
    use windows_sys::Win32::Storage::FileSystem::{
        FileRenameInfo, SetFileInformationByHandle, FILE_RENAME_INFO,
    };

    let target_wide: Vec<u16> = target.as_os_str().encode_wide().collect();
    let name_bytes = target_wide
        .len()
        .checked_mul(mem::size_of::<u16>())
        .ok_or_else(|| std::io::Error::other("Image path is too long"))?;
    let buffer_bytes = mem::size_of::<FILE_RENAME_INFO>()
        .checked_add(name_bytes)
        .ok_or_else(|| std::io::Error::other("Image rename buffer is too large"))?;
    let words = buffer_bytes.div_ceil(mem::size_of::<usize>());
    let mut storage = vec![0_usize; words];
    let info = storage.as_mut_ptr().cast::<FILE_RENAME_INFO>();
    unsafe {
        (*info).Anonymous.ReplaceIfExists = false;
        (*info).RootDirectory = std::ptr::null_mut();
        (*info).FileNameLength = u32::try_from(name_bytes)
            .map_err(|_| std::io::Error::other("Image path is too long"))?;
        std::ptr::copy_nonoverlapping(
            target_wide.as_ptr(),
            (*info).FileName.as_mut_ptr(),
            target_wide.len(),
        );
    }
    let result = unsafe {
        SetFileInformationByHandle(
            file.as_raw_handle(),
            FileRenameInfo,
            info.cast(),
            u32::try_from(buffer_bytes)
                .map_err(|_| std::io::Error::other("Image rename buffer is too large"))?,
        )
    };
    if result == 0 {
        return Err(std::io::Error::last_os_error());
    }
    Ok(())
}

#[cfg(not(windows))]
fn rename_open_file(_file: &File, current: &Path, target: &Path) -> std::io::Result<()> {
    fs::hard_link(current, target)?;
    if let Err(error) = fs::remove_file(current) {
        let _ = fs::remove_file(target);
        return Err(error);
    }
    Ok(())
}

#[cfg(windows)]
fn mark_open_file_for_deletion(file: &File, _path: &Path) -> std::io::Result<()> {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Storage::FileSystem::{
        FileDispositionInfo, SetFileInformationByHandle, FILE_DISPOSITION_INFO,
    };

    let info = FILE_DISPOSITION_INFO { DeleteFile: true };
    let result = unsafe {
        SetFileInformationByHandle(
            file.as_raw_handle(),
            FileDispositionInfo,
            std::ptr::from_ref(&info).cast(),
            u32::try_from(std::mem::size_of_val(&info))
                .expect("FILE_DISPOSITION_INFO always fits in u32"),
        )
    };
    if result == 0 {
        return Err(std::io::Error::last_os_error());
    }
    Ok(())
}

#[cfg(not(windows))]
fn mark_open_file_for_deletion(_file: &File, path: &Path) -> std::io::Result<()> {
    fs::remove_file(path)
}

pub(super) fn validate_source_length(path: &Path, length: u64) -> Result<(), AppError> {
    if length > MAX_SOURCE_BYTES {
        return Err(AppError::Message(format!(
            "Image is larger than the {} MiB safety limit: {}",
            MAX_SOURCE_BYTES / 1024 / 1024,
            display_path(path)
        )));
    }
    Ok(())
}

pub(super) fn validate_image_dimensions(
    path: &Path,
    (width, height): (u32, u32),
) -> Result<(), AppError> {
    let pixels = u64::from(width) * u64::from(height);
    if width == 0
        || height == 0
        || width > MAX_IMAGE_DIMENSION
        || height > MAX_IMAGE_DIMENSION
        || pixels > MAX_IMAGE_PIXELS
    {
        return Err(AppError::Message(format!(
            "Image dimensions {width}x{height} exceed the safety limit: {}",
            display_path(path)
        )));
    }
    Ok(())
}

pub(super) fn validate_traversal_root(path: &Path) -> Result<(), AppError> {
    let metadata = fs::symlink_metadata(path)?;
    if metadata_is_reparse_point(&metadata) || !metadata.is_dir() {
        return Err(AppError::Message(format!(
            "Image folder is not a regular directory: {}",
            display_path(path)
        )));
    }
    Ok(())
}

pub(super) fn metadata_is_reparse_point(metadata: &Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }

    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        attributes_have_reparse_point(metadata.file_attributes())
    }

    #[cfg(not(windows))]
    {
        false
    }
}

#[cfg(windows)]
fn attributes_have_reparse_point(attributes: u32) -> bool {
    use windows_sys::Win32::Storage::FileSystem::FILE_ATTRIBUTE_REPARSE_POINT;

    attributes & FILE_ATTRIBUTE_REPARSE_POINT != 0
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_directory(name: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "amb82-image-safety-{name}-{}-{nonce}",
            std::process::id()
        ))
    }

    #[test]
    fn safety_limits_reject_oversized_sources_and_dimensions() {
        let path = Path::new("oversized.jpg");
        assert!(validate_source_length(path, MAX_SOURCE_BYTES).is_ok());
        assert!(validate_source_length(path, MAX_SOURCE_BYTES + 1).is_err());
        assert!(validate_image_dimensions(path, (MAX_IMAGE_DIMENSION, 1)).is_ok());
        assert!(validate_image_dimensions(path, (MAX_IMAGE_DIMENSION + 1, 1)).is_err());
        assert!(validate_image_dimensions(path, (8_193, 8_192)).is_err());
    }

    #[cfg(windows)]
    #[test]
    fn windows_reparse_attribute_is_always_rejected() {
        use windows_sys::Win32::Storage::FileSystem::{
            FILE_ATTRIBUTE_DIRECTORY, FILE_ATTRIBUTE_REPARSE_POINT,
        };

        assert!(attributes_have_reparse_point(
            FILE_ATTRIBUTE_DIRECTORY | FILE_ATTRIBUTE_REPARSE_POINT
        ));
        assert!(!attributes_have_reparse_point(FILE_ATTRIBUTE_DIRECTORY));
    }

    #[cfg(windows)]
    #[test]
    fn locked_source_rejects_external_rename_and_atomic_replacement() {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::Storage::FileSystem::{
            MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
        };

        let root = test_directory("identity-lock");
        fs::create_dir_all(&root).unwrap();
        let source = root.join("source.png");
        let moved = root.join("source.old.png");
        let replacement = root.join("replacement.png");
        fs::write(&source, b"original image").unwrap();
        fs::write(&replacement, b"replacement image").unwrap();
        let (guard, bytes) = LockedImageSource::open(&source).unwrap().into_parts();

        assert!(fs::rename(&source, &moved).is_err());
        let source_wide: Vec<u16> = replacement
            .as_os_str()
            .encode_wide()
            .chain(Some(0))
            .collect();
        let target_wide: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
        let replaced = unsafe {
            MoveFileExW(
                source_wide.as_ptr(),
                target_wide.as_ptr(),
                MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
            )
        };
        assert_eq!(replaced, 0);
        assert_eq!(bytes, b"original image");
        assert_eq!(fs::read(&source).unwrap(), b"original image");
        assert_eq!(fs::read(&replacement).unwrap(), b"replacement image");

        drop(guard);
        fs::remove_dir_all(root).unwrap();
    }
}
