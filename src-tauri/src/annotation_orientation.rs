use super::{
    create_temporary_part_file, display_path, is_supported_image, replace_downloaded_file, AppError,
};
use image::{
    codecs::{jpeg::JpegEncoder, png::PngEncoder},
    metadata::Orientation,
    DynamicImage, GenericImageView, ImageDecoder, ImageEncoder, ImageFormat, ImageReader,
};
use img_parts::{
    jpeg::{markers, Jpeg, JpegSegment},
    png::{Png, PngChunk},
    Bytes as ContainerBytes,
};
use std::{
    fs,
    io::{BufWriter, Cursor, Write},
    path::Path,
};

const JPEG_QUALITY: u8 = 95;
const MAX_REPORTED_FAILURES: usize = 20;
const EXIF_ORIENTATION_TAG: u16 = 0x0112;
const TIFF_ENTRY_BYTES: usize = 12;
const PNG_ACTL: [u8; 4] = *b"acTL";
const PNG_FCTL: [u8; 4] = *b"fcTL";
const PNG_FDAT: [u8; 4] = *b"fdAT";
const PNG_IDAT: [u8; 4] = *b"IDAT";
const PNG_PHYS: [u8; 4] = *b"pHYs";
const PNG_TEXT: [u8; 4] = *b"tEXt";
const PNG_ZTXT: [u8; 4] = *b"zTXt";
const PNG_ITXT: [u8; 4] = *b"iTXt";

#[derive(Debug)]
enum PreservedMetadata {
    Jpeg {
        jfif: Option<ContainerBytes>,
        comments: Vec<ContainerBytes>,
    },
    Png {
        chunks: Vec<PngChunk>,
    },
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) struct AnnotationOrientationProgress {
    pub(super) processed: usize,
    pub(super) total: usize,
    pub(super) corrected: usize,
    pub(super) failed: usize,
    pub(super) current_file: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) struct AnnotationOrientationSummary {
    pub(super) total: usize,
    pub(super) corrected: usize,
    pub(super) failed: usize,
    pub(super) failed_files: Vec<String>,
}

pub(super) fn normalize_annotation_orientations(
    folder: &Path,
    mut on_progress: impl FnMut(AnnotationOrientationProgress),
) -> Result<AnnotationOrientationSummary, AppError> {
    if !folder.is_dir() {
        return Err(AppError::Message(format!(
            "Image folder does not exist: {}",
            display_path(folder)
        )));
    }

    let mut image_paths = Vec::new();
    for entry in fs::read_dir(folder)? {
        let path = entry?.path();
        if path.is_file() && is_supported_image(&path) {
            image_paths.push(path);
        }
    }
    image_paths.sort_by_key(|path| {
        path.file_name()
            .map(|name| name.to_string_lossy().to_ascii_lowercase())
            .unwrap_or_default()
    });

    let total = image_paths.len();
    let mut summary = AnnotationOrientationSummary {
        total,
        corrected: 0,
        failed: 0,
        failed_files: Vec::new(),
    };
    on_progress(orientation_progress(0, &summary, None));

    for (index, path) in image_paths.iter().enumerate() {
        let file_name = path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| display_path(path));
        on_progress(orientation_progress(
            index,
            &summary,
            Some(file_name.clone()),
        ));
        match normalize_image_orientation(path) {
            Ok(true) => summary.corrected += 1,
            Ok(false) => {}
            Err(error) => {
                summary.failed += 1;
                if summary.failed_files.len() < MAX_REPORTED_FAILURES {
                    summary.failed_files.push(format!("{file_name}: {error}"));
                }
            }
        }
        on_progress(orientation_progress(index + 1, &summary, Some(file_name)));
    }

    Ok(summary)
}

fn orientation_progress(
    processed: usize,
    summary: &AnnotationOrientationSummary,
    current_file: Option<String>,
) -> AnnotationOrientationProgress {
    AnnotationOrientationProgress {
        processed,
        total: summary.total,
        corrected: summary.corrected,
        failed: summary.failed,
        current_file,
    }
}

fn normalize_image_orientation(path: &Path) -> Result<bool, AppError> {
    if path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("bmp"))
    {
        return Ok(false);
    }

    let original_bytes = ContainerBytes::from(fs::read(path)?);
    let metadata_reader = image_reader_from_bytes(original_bytes.clone())?;
    let format = metadata_reader.format().ok_or_else(|| {
        AppError::Message(format!(
            "Could not determine image format for {}",
            display_path(path)
        ))
    })?;
    let mut decoder = metadata_reader
        .into_decoder()
        .map_err(|error| image_operation_error(path, "read image metadata", error))?;
    let Some(mut exif) = decoder
        .exif_metadata()
        .map_err(|error| image_operation_error(path, "read EXIF metadata", error))?
    else {
        return Ok(false);
    };
    let Some(orientation) = Orientation::from_exif_chunk(&exif) else {
        return Ok(false);
    };
    if orientation == Orientation::NoTransforms {
        return Ok(false);
    }
    let icc_profile = decoder
        .icc_profile()
        .map_err(|error| image_operation_error(path, "read ICC profile", error))?;
    let preserved_metadata = collect_preserved_metadata(
        format,
        original_bytes,
        orientation,
        icc_profile.is_some(),
        path,
    )?;

    let removed = remove_orientation_entries(&mut exif)?;
    if removed == 0 {
        return Err(AppError::Message(format!(
            "EXIF orientation was detected but could not be removed from {}",
            display_path(path)
        )));
    }

    let mut image = DynamicImage::from_decoder(decoder)
        .map_err(|error| image_operation_error(path, "decode image", error))?;
    image.apply_orientation(orientation);
    let expected_dimensions = image.dimensions();

    let (temporary_path, mut temporary_file) = create_temporary_part_file(path)?;
    let write_result = (|| -> Result<(), AppError> {
        let encoded =
            encode_normalized_image(format, &image, exif.clone(), icc_profile.clone(), path)?;
        {
            let mut writer = BufWriter::new(&mut temporary_file);
            write_with_preserved_metadata(&mut writer, format, encoded, preserved_metadata, path)?;
            writer.flush()?;
        }
        temporary_file.flush()?;
        temporary_file.sync_all()?;
        Ok(())
    })();
    drop(temporary_file);
    drop(image);

    if let Err(error) = write_result {
        let _ = fs::remove_file(&temporary_path);
        return Err(error);
    }
    if let Err(error) = verify_normalized_image(
        &temporary_path,
        expected_dimensions,
        &exif,
        icc_profile.as_deref(),
    ) {
        let _ = fs::remove_file(&temporary_path);
        return Err(error);
    }
    if let Err(error) = replace_downloaded_file(&temporary_path, path) {
        let _ = fs::remove_file(&temporary_path);
        return Err(error);
    }

    Ok(true)
}

fn image_reader_from_bytes(
    bytes: ContainerBytes,
) -> Result<ImageReader<Cursor<ContainerBytes>>, AppError> {
    ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(AppError::from)
}

fn encode_normalized_image(
    format: ImageFormat,
    image: &DynamicImage,
    exif: Vec<u8>,
    icc_profile: Option<Vec<u8>>,
    source_path: &Path,
) -> Result<Vec<u8>, AppError> {
    let mut encoded = Vec::new();
    match format {
        ImageFormat::Jpeg => {
            let mut encoder = JpegEncoder::new_with_quality(&mut encoded, JPEG_QUALITY);
            attach_metadata(&mut encoder, exif, icc_profile, source_path)?;
            image
                .write_with_encoder(encoder)
                .map_err(|error| image_operation_error(source_path, "encode JPEG", error))?;
        }
        ImageFormat::Png => {
            let mut encoder = PngEncoder::new(&mut encoded);
            attach_metadata(&mut encoder, exif, icc_profile, source_path)?;
            image
                .write_with_encoder(encoder)
                .map_err(|error| image_operation_error(source_path, "encode PNG", error))?;
        }
        _ => {
            return Err(AppError::Message(format!(
                "EXIF orientation normalization is unsupported for {}",
                display_path(source_path)
            )))
        }
    }
    Ok(encoded)
}

fn attach_metadata(
    encoder: &mut impl ImageEncoder,
    exif: Vec<u8>,
    icc_profile: Option<Vec<u8>>,
    source_path: &Path,
) -> Result<(), AppError> {
    encoder
        .set_exif_metadata(exif)
        .map_err(|error| image_operation_error(source_path, "preserve EXIF metadata", error))?;
    if let Some(icc_profile) = icc_profile {
        encoder
            .set_icc_profile(icc_profile)
            .map_err(|error| image_operation_error(source_path, "preserve ICC profile", error))?;
    }
    Ok(())
}

fn collect_preserved_metadata(
    format: ImageFormat,
    bytes: ContainerBytes,
    orientation: Orientation,
    has_icc_profile: bool,
    source_path: &Path,
) -> Result<PreservedMetadata, AppError> {
    match format {
        ImageFormat::Jpeg => {
            let jpeg = Jpeg::from_bytes(bytes).map_err(|error| {
                image_operation_error(source_path, "inspect JPEG metadata", error)
            })?;
            let jfif = jpeg
                .segments()
                .iter()
                .find_map(|segment| rebuilt_jfif(segment, orientation));
            let comments = jpeg
                .segments()
                .iter()
                .filter(|segment| segment.marker() == markers::COM)
                .map(|segment| segment.contents().clone())
                .collect();
            Ok(PreservedMetadata::Jpeg { jfif, comments })
        }
        ImageFormat::Png => {
            let png = Png::from_bytes(bytes).map_err(|error| {
                image_operation_error(source_path, "inspect PNG metadata", error)
            })?;
            if png
                .chunks()
                .iter()
                .any(|chunk| matches!(chunk.kind(), PNG_ACTL | PNG_FCTL | PNG_FDAT))
            {
                return Err(AppError::Message(format!(
                    "Animated PNG cannot be normalized without losing frames: {}",
                    display_path(source_path)
                )));
            }

            let mut chunks = Vec::new();
            let mut singleton_kinds = Vec::new();
            for chunk in png.chunks() {
                let kind = chunk.kind();
                let preserved = if kind == PNG_PHYS {
                    rebuilt_png_phys(chunk, orientation)
                } else if matches!(kind, PNG_TEXT | PNG_ZTXT | PNG_ITXT) {
                    safe_png_text_chunk(chunk).then(|| chunk.clone())
                } else if is_safe_png_color_chunk(kind) {
                    if (kind == *b"sRGB" && has_icc_profile) || singleton_kinds.contains(&kind) {
                        None
                    } else {
                        singleton_kinds.push(kind);
                        Some(chunk.clone())
                    }
                } else if kind == *b"tIME" && !singleton_kinds.contains(&kind) {
                    singleton_kinds.push(kind);
                    Some(chunk.clone())
                } else {
                    None
                };
                if let Some(chunk) = preserved {
                    chunks.push(chunk);
                }
            }
            Ok(PreservedMetadata::Png { chunks })
        }
        _ => Err(AppError::Message(format!(
            "EXIF orientation normalization is unsupported for {}",
            display_path(source_path)
        ))),
    }
}

fn rebuilt_jfif(segment: &JpegSegment, orientation: Orientation) -> Option<ContainerBytes> {
    let contents = segment.contents();
    if segment.marker() != markers::APP0 || contents.len() < 14 || !contents.starts_with(b"JFIF\0")
    {
        return None;
    }

    let mut rebuilt = contents[..12].to_vec();
    if orientation_swaps_axes(orientation) {
        let x_density = [rebuilt[8], rebuilt[9]];
        let y_density = [rebuilt[10], rebuilt[11]];
        rebuilt[8..10].copy_from_slice(&y_density);
        rebuilt[10..12].copy_from_slice(&x_density);
    }
    rebuilt.extend_from_slice(&[0, 0]);
    Some(ContainerBytes::from(rebuilt))
}

fn rebuilt_png_phys(chunk: &PngChunk, orientation: Orientation) -> Option<PngChunk> {
    if chunk.contents().len() != 9 {
        return None;
    }
    let mut contents = chunk.contents().to_vec();
    if orientation_swaps_axes(orientation) {
        let x_density = [contents[0], contents[1], contents[2], contents[3]];
        contents.copy_within(4..8, 0);
        contents[4..8].copy_from_slice(&x_density);
    }
    Some(PngChunk::new(PNG_PHYS, ContainerBytes::from(contents)))
}

fn orientation_swaps_axes(orientation: Orientation) -> bool {
    matches!(
        orientation,
        Orientation::Rotate90
            | Orientation::Rotate270
            | Orientation::Rotate90FlipH
            | Orientation::Rotate270FlipH
    )
}

fn safe_png_text_chunk(chunk: &PngChunk) -> bool {
    let Some(keyword_end) = chunk.contents().iter().position(|byte| *byte == 0) else {
        return false;
    };
    if !(1..=79).contains(&keyword_end) {
        return false;
    }
    let keyword = String::from_utf8_lossy(&chunk.contents()[..keyword_end]).to_ascii_lowercase();
    !keyword.contains("xmp")
}

fn is_safe_png_color_chunk(kind: [u8; 4]) -> bool {
    matches!(
        kind,
        [b'g', b'A', b'M', b'A']
            | [b'c', b'H', b'R', b'M']
            | [b's', b'R', b'G', b'B']
            | [b'c', b'I', b'C', b'P']
            | [b'm', b'D', b'C', b'v']
            | [b'c', b'L', b'L', b'i']
    )
}

fn is_replaced_png_metadata(kind: [u8; 4]) -> bool {
    kind == PNG_PHYS
        || matches!(kind, PNG_TEXT | PNG_ZTXT | PNG_ITXT)
        || is_safe_png_color_chunk(kind)
        || kind == *b"tIME"
}

fn write_with_preserved_metadata(
    writer: &mut impl Write,
    format: ImageFormat,
    encoded: Vec<u8>,
    preserved: PreservedMetadata,
    source_path: &Path,
) -> Result<(), AppError> {
    match (format, preserved) {
        (ImageFormat::Jpeg, PreservedMetadata::Jpeg { jfif, comments }) => {
            let mut jpeg = Jpeg::from_bytes(ContainerBytes::from(encoded)).map_err(|error| {
                image_operation_error(source_path, "rebuild JPEG metadata", error)
            })?;
            jpeg.segments_mut()
                .retain(|segment| segment.marker() != markers::COM);
            if let Some(jfif) = jfif {
                let replacement = JpegSegment::new_with_contents(markers::APP0, jfif);
                if let Some(segment) = jpeg.segments_mut().iter_mut().find(|segment| {
                    segment.marker() == markers::APP0 && segment.contents().starts_with(b"JFIF\0")
                }) {
                    *segment = replacement;
                } else {
                    jpeg.segments_mut().insert(0, replacement);
                }
            }
            let insert_at = jpeg
                .segments()
                .iter()
                .position(|segment| !(markers::APP0..=markers::APP15).contains(&segment.marker()))
                .unwrap_or_else(|| jpeg.segments().len());
            let comments = comments
                .into_iter()
                .map(|contents| JpegSegment::new_with_contents(markers::COM, contents));
            jpeg.segments_mut().splice(insert_at..insert_at, comments);
            jpeg.encoder().write_to(&mut *writer)?;
        }
        (ImageFormat::Png, PreservedMetadata::Png { chunks }) => {
            let mut png = Png::from_bytes(ContainerBytes::from(encoded)).map_err(|error| {
                image_operation_error(source_path, "rebuild PNG metadata", error)
            })?;
            png.chunks_mut()
                .retain(|chunk| !is_replaced_png_metadata(chunk.kind()));
            let insert_at = png
                .chunks()
                .iter()
                .position(|chunk| chunk.kind() == PNG_IDAT)
                .ok_or_else(|| {
                    AppError::Message(format!(
                        "Encoded PNG contains no image data: {}",
                        display_path(source_path)
                    ))
                })?;
            png.chunks_mut().splice(insert_at..insert_at, chunks);
            png.encoder().write_to(&mut *writer)?;
        }
        _ => {
            return Err(AppError::Message(format!(
                "Encoded image format changed unexpectedly for {}",
                display_path(source_path)
            )))
        }
    }
    Ok(())
}

fn verify_normalized_image(
    path: &Path,
    expected_dimensions: (u32, u32),
    expected_exif: &[u8],
    expected_icc: Option<&[u8]>,
) -> Result<(), AppError> {
    let bytes = ContainerBytes::from(fs::read(path)?);
    let metadata_reader = image_reader_from_bytes(bytes)?;
    let mut decoder = metadata_reader
        .into_decoder()
        .map_err(|error| image_operation_error(path, "verify image metadata", error))?;
    if decoder.dimensions() != expected_dimensions {
        return Err(AppError::Message(format!(
            "Normalized image dimensions changed unexpectedly for {}",
            display_path(path)
        )));
    }
    let actual_exif = decoder
        .exif_metadata()
        .map_err(|error| image_operation_error(path, "verify EXIF metadata", error))?;
    if actual_exif.as_deref() != Some(expected_exif) {
        return Err(AppError::Message(format!(
            "Normalized image did not preserve the edited EXIF metadata: {}",
            display_path(path)
        )));
    }
    if count_orientation_entries(actual_exif.as_deref().unwrap_or_default())? != 0 {
        return Err(AppError::Message(format!(
            "Normalized image still contains an EXIF orientation tag: {}",
            display_path(path)
        )));
    }
    let actual_icc = decoder
        .icc_profile()
        .map_err(|error| image_operation_error(path, "verify ICC profile", error))?;
    if actual_icc.as_deref() != expected_icc {
        return Err(AppError::Message(format!(
            "Normalized image did not preserve its ICC profile: {}",
            display_path(path)
        )));
    }

    let decoded = DynamicImage::from_decoder(decoder)
        .map_err(|error| image_operation_error(path, "verify encoded image", error))?;
    if decoded.dimensions() != expected_dimensions {
        return Err(AppError::Message(format!(
            "Normalized image could not be verified: {}",
            display_path(path)
        )));
    }
    Ok(())
}

fn image_operation_error(path: &Path, operation: &str, error: impl std::fmt::Display) -> AppError {
    AppError::Message(format!(
        "Failed to {operation} for {}: {error}",
        display_path(path)
    ))
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum TiffEndian {
    Little,
    Big,
}

fn remove_orientation_entries(exif: &mut [u8]) -> Result<usize, AppError> {
    let (endian, entries_start, mut entry_count) = tiff_ifd0_layout(exif)?;
    let mut removed = 0_usize;
    let mut index = 0_usize;

    while index < entry_count {
        let entry_start = entries_start + index * TIFF_ENTRY_BYTES;
        if read_u16(&exif[entry_start..entry_start + 2], endian) != EXIF_ORIENTATION_TAG {
            index += 1;
            continue;
        }

        let table_end = entries_start
            .checked_add(
                entry_count
                    .checked_mul(TIFF_ENTRY_BYTES)
                    .ok_or_else(|| AppError::Message("Invalid EXIF IFD entry count".into()))?,
            )
            .and_then(|end| end.checked_add(4))
            .ok_or_else(|| AppError::Message("Invalid EXIF IFD table size".into()))?;
        exif.copy_within(entry_start + TIFF_ENTRY_BYTES..table_end, entry_start);
        exif[table_end - TIFF_ENTRY_BYTES..table_end].fill(0);
        entry_count -= 1;
        removed += 1;
        write_u16(
            &mut exif[entries_start - 2..entries_start],
            entry_count as u16,
            endian,
        );
    }

    let next_ifd_start = entries_start
        .checked_add(
            entry_count
                .checked_mul(TIFF_ENTRY_BYTES)
                .ok_or_else(|| AppError::Message("Invalid EXIF IFD entry count".into()))?,
        )
        .ok_or_else(|| AppError::Message("Invalid EXIF IFD table size".into()))?;
    write_u32(&mut exif[next_ifd_start..next_ifd_start + 4], 0, endian);

    Ok(removed)
}

fn count_orientation_entries(exif: &[u8]) -> Result<usize, AppError> {
    let (endian, entries_start, entry_count) = tiff_ifd0_layout(exif)?;
    Ok((0..entry_count)
        .filter(|index| {
            let entry_start = entries_start + index * TIFF_ENTRY_BYTES;
            read_u16(&exif[entry_start..entry_start + 2], endian) == EXIF_ORIENTATION_TAG
        })
        .count())
}

fn tiff_ifd0_layout(exif: &[u8]) -> Result<(TiffEndian, usize, usize), AppError> {
    if exif.len() < 8 {
        return Err(AppError::Message("Invalid EXIF TIFF header".into()));
    }
    let endian = match &exif[..4] {
        [0x49, 0x49, 42, 0] => TiffEndian::Little,
        [0x4d, 0x4d, 0, 42] => TiffEndian::Big,
        _ => return Err(AppError::Message("Invalid EXIF TIFF byte order".into())),
    };
    let ifd_offset = usize::try_from(read_u32(&exif[4..8], endian))
        .map_err(|_| AppError::Message("Invalid EXIF IFD offset".into()))?;
    let count_end = ifd_offset
        .checked_add(2)
        .filter(|end| *end <= exif.len())
        .ok_or_else(|| AppError::Message("EXIF IFD offset is out of bounds".into()))?;
    let entry_count = usize::from(read_u16(&exif[ifd_offset..count_end], endian));
    let entries_start = count_end;
    let _table_end = entries_start
        .checked_add(
            entry_count
                .checked_mul(TIFF_ENTRY_BYTES)
                .ok_or_else(|| AppError::Message("Invalid EXIF IFD entry count".into()))?,
        )
        .and_then(|end| end.checked_add(4))
        .filter(|end| *end <= exif.len())
        .ok_or_else(|| AppError::Message("EXIF IFD table is out of bounds".into()))?;
    Ok((endian, entries_start, entry_count))
}

fn read_u16(bytes: &[u8], endian: TiffEndian) -> u16 {
    let bytes = [bytes[0], bytes[1]];
    match endian {
        TiffEndian::Little => u16::from_le_bytes(bytes),
        TiffEndian::Big => u16::from_be_bytes(bytes),
    }
}

fn read_u32(bytes: &[u8], endian: TiffEndian) -> u32 {
    let bytes = [bytes[0], bytes[1], bytes[2], bytes[3]];
    match endian {
        TiffEndian::Little => u32::from_le_bytes(bytes),
        TiffEndian::Big => u32::from_be_bytes(bytes),
    }
}

fn write_u16(bytes: &mut [u8], value: u16, endian: TiffEndian) {
    let encoded = match endian {
        TiffEndian::Little => value.to_le_bytes(),
        TiffEndian::Big => value.to_be_bytes(),
    };
    bytes.copy_from_slice(&encoded);
}

fn write_u32(bytes: &mut [u8], value: u32, endian: TiffEndian) {
    let encoded = match endian {
        TiffEndian::Little => value.to_le_bytes(),
        TiffEndian::Big => value.to_be_bytes(),
    };
    bytes.copy_from_slice(&encoded);
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{DynamicImage, GrayImage, ImageBuffer};
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_directory(name: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "amb82-orientation-{name}-{}-{nonce}",
            std::process::id()
        ))
    }

    fn write_number(bytes: &mut [u8], value: u32, endian: TiffEndian) {
        let encoded = match endian {
            TiffEndian::Little => value.to_le_bytes(),
            TiffEndian::Big => value.to_be_bytes(),
        };
        bytes.copy_from_slice(&encoded);
    }

    fn test_exif(orientation: u16, endian: TiffEndian) -> Vec<u8> {
        let mut exif = vec![0_u8; 8 + 2 + 2 * TIFF_ENTRY_BYTES + 4];
        match endian {
            TiffEndian::Little => exif[..4].copy_from_slice(&[0x49, 0x49, 42, 0]),
            TiffEndian::Big => exif[..4].copy_from_slice(&[0x4d, 0x4d, 0, 42]),
        }
        write_number(&mut exif[4..8], 8, endian);
        write_u16(&mut exif[8..10], 2, endian);

        let orientation_entry = 10;
        write_u16(
            &mut exif[orientation_entry..orientation_entry + 2],
            EXIF_ORIENTATION_TAG,
            endian,
        );
        write_u16(
            &mut exif[orientation_entry + 2..orientation_entry + 4],
            3,
            endian,
        );
        write_number(
            &mut exif[orientation_entry + 4..orientation_entry + 8],
            1,
            endian,
        );
        write_u16(
            &mut exif[orientation_entry + 8..orientation_entry + 10],
            orientation,
            endian,
        );

        let make_entry = orientation_entry + TIFF_ENTRY_BYTES;
        write_u16(&mut exif[make_entry..make_entry + 2], 0x010f, endian);
        write_u16(&mut exif[make_entry + 2..make_entry + 4], 2, endian);
        write_number(&mut exif[make_entry + 4..make_entry + 8], 4, endian);
        exif[make_entry + 8..make_entry + 12].copy_from_slice(b"cam\0");
        exif
    }

    fn base_image() -> GrayImage {
        ImageBuffer::from_raw(2, 3, vec![1, 2, 3, 4, 5, 6]).unwrap()
    }

    fn write_png(path: &Path, image: &DynamicImage, exif: Option<Vec<u8>>) {
        write_png_with_metadata(path, image, exif, None);
    }

    fn write_png_with_metadata(
        path: &Path,
        image: &DynamicImage,
        exif: Option<Vec<u8>>,
        icc: Option<Vec<u8>>,
    ) {
        let file = fs::File::create(path).unwrap();
        let mut encoder = PngEncoder::new(BufWriter::new(file));
        if let Some(exif) = exif {
            encoder.set_exif_metadata(exif).unwrap();
        }
        if let Some(icc) = icc {
            encoder.set_icc_profile(icc).unwrap();
        }
        image.write_with_encoder(encoder).unwrap();
    }

    fn write_jpeg(path: &Path, image: &DynamicImage, exif: Vec<u8>) {
        write_jpeg_with_metadata(path, image, exif, None);
    }

    fn write_jpeg_with_metadata(
        path: &Path,
        image: &DynamicImage,
        exif: Vec<u8>,
        icc: Option<Vec<u8>>,
    ) {
        let file = fs::File::create(path).unwrap();
        let mut encoder = JpegEncoder::new_with_quality(BufWriter::new(file), 95);
        encoder.set_exif_metadata(exif).unwrap();
        if let Some(icc) = icc {
            encoder.set_icc_profile(icc).unwrap();
        }
        image.write_with_encoder(encoder).unwrap();
    }

    fn image_reader(path: &Path) -> ImageReader<Cursor<ContainerBytes>> {
        image_reader_from_bytes(ContainerBytes::from(fs::read(path).unwrap())).unwrap()
    }

    fn image_metadata(path: &Path) -> (Option<Vec<u8>>, Option<Vec<u8>>) {
        let mut decoder = image_reader(path).into_decoder().unwrap();
        let exif = decoder.exif_metadata().unwrap();
        let icc = decoder.icc_profile().unwrap();
        (exif, icc)
    }

    fn output_has_orientation(path: &Path) -> bool {
        let reader = image_reader(path);
        let mut decoder = reader.into_decoder().unwrap();
        decoder
            .exif_metadata()
            .unwrap()
            .is_some_and(|exif| count_orientation_entries(&exif).unwrap() > 0)
    }

    #[test]
    fn removes_orientation_entry_in_both_byte_orders_without_losing_other_entries() {
        for endian in [TiffEndian::Little, TiffEndian::Big] {
            let mut exif = test_exif(6, endian);
            let (_, old_entries_start, old_entry_count) = tiff_ifd0_layout(&exif).unwrap();
            let old_table_end = old_entries_start + old_entry_count * TIFF_ENTRY_BYTES + 4;
            write_number(
                &mut exif[old_table_end - 4..old_table_end],
                0x1234_5678,
                endian,
            );
            exif.extend_from_slice(b"trailing metadata");
            assert_eq!(
                Orientation::from_exif_chunk(&exif),
                Some(Orientation::Rotate90)
            );

            assert_eq!(remove_orientation_entries(&mut exif).unwrap(), 1);

            assert_eq!(count_orientation_entries(&exif).unwrap(), 0);
            assert_eq!(Orientation::from_exif_chunk(&exif), None);
            let (_, entries_start, entry_count) = tiff_ifd0_layout(&exif).unwrap();
            assert_eq!(entry_count, 1);
            assert_eq!(
                read_u16(&exif[entries_start..entries_start + 2], endian),
                0x010f
            );
            assert_eq!(&exif[entries_start + 8..entries_start + 12], b"cam\0");
            let new_table_end = entries_start + entry_count * TIFF_ENTRY_BYTES + 4;
            assert_eq!(read_u32(&exif[new_table_end - 4..new_table_end], endian), 0);
            assert_eq!(&exif[old_table_end..], b"trailing metadata");
        }
    }

    #[test]
    fn applies_every_exif_orientation_to_pixels() {
        let cases: &[(u8, u32, u32, &[u8])] = &[
            (2, 2, 3, &[2, 1, 4, 3, 6, 5]),
            (3, 2, 3, &[6, 5, 4, 3, 2, 1]),
            (4, 2, 3, &[5, 6, 3, 4, 1, 2]),
            (5, 3, 2, &[1, 3, 5, 2, 4, 6]),
            (6, 3, 2, &[5, 3, 1, 6, 4, 2]),
            (7, 3, 2, &[6, 4, 2, 5, 3, 1]),
            (8, 3, 2, &[2, 4, 6, 1, 3, 5]),
        ];

        for (value, width, height, expected) in cases {
            let mut image = DynamicImage::ImageLuma8(base_image());
            image.apply_orientation(Orientation::from_exif(*value).unwrap());
            assert_eq!(image.dimensions(), (*width, *height));
            assert_eq!(image.to_luma8().as_raw(), expected);
        }
    }

    #[test]
    fn normalizes_png_once_and_leaves_unoriented_png_untouched() {
        let root = test_directory("png");
        fs::create_dir_all(&root).unwrap();
        let oriented = root.join("oriented.png");
        let untouched = root.join("untouched.png");
        let image = DynamicImage::ImageLuma8(base_image());
        write_png(&oriented, &image, Some(test_exif(6, TiffEndian::Little)));
        write_png(&untouched, &image, None);
        let untouched_before = fs::read(&untouched).unwrap();

        let first = normalize_annotation_orientations(&root, |_| {}).unwrap();

        assert_eq!(first.total, 2);
        assert_eq!(first.corrected, 1);
        assert_eq!(first.failed, 0);
        assert!(!output_has_orientation(&oriented));
        let decoded = image_reader(&oriented).decode().unwrap();
        assert_eq!(decoded.dimensions(), (3, 2));
        assert_eq!(decoded.to_luma8().as_raw(), &[5, 3, 1, 6, 4, 2]);
        assert_eq!(fs::read(&untouched).unwrap(), untouched_before);
        let oriented_after_first = fs::read(&oriented).unwrap();

        let second = normalize_annotation_orientations(&root, |_| {}).unwrap();

        assert_eq!(second.corrected, 0);
        assert_eq!(second.failed, 0);
        assert_eq!(fs::read(&oriented).unwrap(), oriented_after_first);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn normalizes_jpeg_and_removes_its_orientation_entry() {
        let root = test_directory("jpeg");
        fs::create_dir_all(&root).unwrap();
        let path = root.join("oriented.jpg");
        write_jpeg(
            &path,
            &DynamicImage::ImageLuma8(base_image()),
            test_exif(6, TiffEndian::Big),
        );

        let summary = normalize_annotation_orientations(&root, |_| {}).unwrap();

        assert_eq!(summary.corrected, 1);
        assert_eq!(summary.failed, 0);
        assert!(!output_has_orientation(&path));
        assert_eq!(image_reader(&path).decode().unwrap().dimensions(), (3, 2));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn jpeg_preserves_exact_exif_icc_comments_and_rebuilds_jfif_density() {
        let root = test_directory("jpeg-metadata");
        fs::create_dir_all(&root).unwrap();
        let path = root.join("metadata.jpg");
        let original_exif = test_exif(6, TiffEndian::Little);
        let icc = b"annotation-test-icc-profile".to_vec();
        write_jpeg_with_metadata(
            &path,
            &DynamicImage::ImageLuma8(base_image()),
            original_exif.clone(),
            Some(icc.clone()),
        );

        let mut jpeg = Jpeg::from_bytes(ContainerBytes::from(fs::read(&path).unwrap())).unwrap();
        let jfif_with_thumbnail = ContainerBytes::from(vec![
            b'J', b'F', b'I', b'F', 0, 1, 2, 1, 1, 44, 0, 150, 1, 1, 10, 20, 30,
        ]);
        let jfif = jpeg
            .segments_mut()
            .iter_mut()
            .find(|segment| {
                segment.marker() == markers::APP0 && segment.contents().starts_with(b"JFIF\0")
            })
            .unwrap();
        *jfif = JpegSegment::new_with_contents(markers::APP0, jfif_with_thumbnail);
        jpeg.segments_mut().insert(
            1,
            JpegSegment::new_with_contents(
                markers::COM,
                ContainerBytes::from_static(b"keep this comment"),
            ),
        );
        jpeg.encoder()
            .write_to(fs::File::create(&path).unwrap())
            .unwrap();
        let mut expected_exif = original_exif;
        remove_orientation_entries(&mut expected_exif).unwrap();

        let summary = normalize_annotation_orientations(&root, |_| {}).unwrap();

        assert_eq!(summary.corrected, 1);
        assert_eq!(summary.failed, 0);
        assert_eq!(image_metadata(&path), (Some(expected_exif), Some(icc)));
        let jpeg = Jpeg::from_bytes(ContainerBytes::from(fs::read(&path).unwrap())).unwrap();
        let jfif = jpeg
            .segments()
            .iter()
            .find(|segment| {
                segment.marker() == markers::APP0 && segment.contents().starts_with(b"JFIF\0")
            })
            .unwrap()
            .contents();
        assert_eq!(jfif.len(), 14);
        assert_eq!(u16::from_be_bytes([jfif[8], jfif[9]]), 150);
        assert_eq!(u16::from_be_bytes([jfif[10], jfif[11]]), 300);
        assert_eq!(&jfif[12..14], &[0, 0]);
        assert!(jpeg.segments().iter().any(|segment| {
            segment.marker() == markers::COM && segment.contents().as_ref() == b"keep this comment"
        }));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn png_preserves_safe_metadata_swaps_phys_and_drops_unsafe_chunks() {
        let root = test_directory("png-metadata");
        fs::create_dir_all(&root).unwrap();
        let path = root.join("metadata.png");
        let original_exif = test_exif(6, TiffEndian::Big);
        let icc = b"annotation-png-icc-profile".to_vec();
        write_png_with_metadata(
            &path,
            &DynamicImage::ImageLuma8(base_image()),
            Some(original_exif.clone()),
            Some(icc.clone()),
        );

        let mut png = Png::from_bytes(ContainerBytes::from(fs::read(&path).unwrap())).unwrap();
        let mut phys = Vec::new();
        phys.extend_from_slice(&3_000_u32.to_be_bytes());
        phys.extend_from_slice(&6_000_u32.to_be_bytes());
        phys.push(1);
        let metadata_chunks = vec![
            PngChunk::new(
                *b"gAMA",
                ContainerBytes::copy_from_slice(&45_455_u32.to_be_bytes()),
            ),
            PngChunk::new(PNG_PHYS, ContainerBytes::from(phys)),
            PngChunk::new(PNG_TEXT, ContainerBytes::from_static(b"Description\0kept")),
            PngChunk::new(
                PNG_ITXT,
                ContainerBytes::from_static(
                    b"XML:com.adobe.xmp\0\0\0\0\0<tiff:Orientation>6</tiff:Orientation>",
                ),
            ),
            PngChunk::new(*b"bKGD", ContainerBytes::from_static(&[0, 0])),
        ];
        png.chunks_mut().splice(1..1, metadata_chunks);
        png.encoder()
            .write_to(fs::File::create(&path).unwrap())
            .unwrap();
        let mut expected_exif = original_exif;
        remove_orientation_entries(&mut expected_exif).unwrap();

        let summary = normalize_annotation_orientations(&root, |_| {}).unwrap();

        assert_eq!(summary.corrected, 1);
        assert_eq!(summary.failed, 0);
        assert_eq!(image_metadata(&path), (Some(expected_exif), Some(icc)));
        let png = Png::from_bytes(ContainerBytes::from(fs::read(&path).unwrap())).unwrap();
        let phys = png.chunk_by_type(PNG_PHYS).unwrap().contents();
        assert_eq!(u32::from_be_bytes(phys[0..4].try_into().unwrap()), 6_000);
        assert_eq!(u32::from_be_bytes(phys[4..8].try_into().unwrap()), 3_000);
        assert_eq!(phys[8], 1);
        assert!(png
            .chunks_by_type(PNG_TEXT)
            .any(|chunk| chunk.contents().as_ref() == b"Description\0kept"));
        assert!(png.chunk_by_type(*b"gAMA").is_some());
        assert!(png.chunk_by_type(*b"bKGD").is_none());
        assert!(png
            .chunks_by_type(PNG_ITXT)
            .all(|chunk| !chunk.contents().starts_with(b"XML:com.adobe.xmp\0")));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn animated_png_is_reported_and_kept_byte_for_byte() {
        let root = test_directory("apng");
        fs::create_dir_all(&root).unwrap();
        let path = root.join("animated.png");
        write_png(
            &path,
            &DynamicImage::ImageLuma8(base_image()),
            Some(test_exif(6, TiffEndian::Little)),
        );
        let mut png = Png::from_bytes(ContainerBytes::from(fs::read(&path).unwrap())).unwrap();
        let mut animation_control = Vec::new();
        animation_control.extend_from_slice(&1_u32.to_be_bytes());
        animation_control.extend_from_slice(&0_u32.to_be_bytes());
        let mut frame_control = Vec::new();
        frame_control.extend_from_slice(&0_u32.to_be_bytes());
        frame_control.extend_from_slice(&2_u32.to_be_bytes());
        frame_control.extend_from_slice(&3_u32.to_be_bytes());
        frame_control.extend_from_slice(&0_u32.to_be_bytes());
        frame_control.extend_from_slice(&0_u32.to_be_bytes());
        frame_control.extend_from_slice(&1_u16.to_be_bytes());
        frame_control.extend_from_slice(&10_u16.to_be_bytes());
        frame_control.extend_from_slice(&[0, 0]);
        png.chunks_mut().splice(
            1..1,
            [
                PngChunk::new(PNG_ACTL, ContainerBytes::from(animation_control)),
                PngChunk::new(PNG_FCTL, ContainerBytes::from(frame_control)),
            ],
        );
        png.encoder()
            .write_to(fs::File::create(&path).unwrap())
            .unwrap();
        let before = fs::read(&path).unwrap();

        let summary = normalize_annotation_orientations(&root, |_| {}).unwrap();

        assert_eq!(summary.corrected, 0);
        assert_eq!(summary.failed, 1);
        assert!(summary.failed_files[0].contains("Animated PNG"));
        assert_eq!(fs::read(&path).unwrap(), before);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn strict_verification_rejects_missing_exif_or_icc() {
        let root = test_directory("metadata-verification");
        fs::create_dir_all(&root).unwrap();
        let no_exif = root.join("no-exif.png");
        write_png(&no_exif, &DynamicImage::ImageLuma8(base_image()), None);
        let mut expected_exif = test_exif(6, TiffEndian::Little);
        remove_orientation_entries(&mut expected_exif).unwrap();
        assert!(verify_normalized_image(&no_exif, (2, 3), &expected_exif, None).is_err());

        let no_icc = root.join("no-icc.png");
        write_png(
            &no_icc,
            &DynamicImage::ImageLuma8(base_image()),
            Some(expected_exif.clone()),
        );
        assert!(
            verify_normalized_image(&no_icc, (2, 3), &expected_exif, Some(b"missing ICC")).is_err()
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn failed_image_keeps_original_bytes_and_scan_continues() {
        let root = test_directory("failure");
        fs::create_dir_all(&root).unwrap();
        let broken = root.join("broken.jpg");
        let valid = root.join("valid.png");
        fs::write(&broken, b"not a jpeg").unwrap();
        write_png(&valid, &DynamicImage::ImageLuma8(base_image()), None);
        let broken_before = fs::read(&broken).unwrap();
        let mut progress = Vec::new();

        let summary =
            normalize_annotation_orientations(&root, |event| progress.push(event)).unwrap();

        assert_eq!(summary.total, 2);
        assert_eq!(summary.corrected, 0);
        assert_eq!(summary.failed, 1);
        assert_eq!(summary.failed_files.len(), 1);
        assert_eq!(fs::read(&broken).unwrap(), broken_before);
        assert_eq!(progress.first().unwrap().processed, 0);
        assert_eq!(progress.last().unwrap().processed, 2);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn malformed_exif_layout_is_rejected_without_panicking() {
        let mut exif = vec![0x49, 0x49, 42, 0, 0xff, 0xff, 0xff, 0xff];
        assert!(remove_orientation_entries(&mut exif).is_err());
        assert!(count_orientation_entries(&exif).is_err());
    }
}
