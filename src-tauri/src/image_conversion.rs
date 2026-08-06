use super::{display_path, AppError};
use crate::annotation_orientation::{
    count_orientation_entries, normalize_image_orientation, remove_orientation_entries,
    JPEG_QUALITY,
};
use crate::image_safety::{
    create_locked_temporary_image, metadata_is_reparse_point, validate_image_dimensions,
    validate_traversal_root, ImageSourceGuard, LockedImageSource,
};
use hpvcd::{
    Decoder as HeicDecoder, ImageBuffer as HeicImageBuffer, Orientation as HeicOrientation,
    SampleBuf as HeicSampleBuf,
};
use image::{
    codecs::{jpeg::JpegEncoder, webp::WebPDecoder},
    metadata::Orientation,
    DynamicImage, GenericImageView, ImageDecoder, ImageEncoder, ImageFormat, ImageReader, RgbImage,
};
use std::{
    any::Any,
    collections::{HashMap, HashSet},
    fs,
    io::{BufWriter, Cursor, Write},
    panic::{catch_unwind, AssertUnwindSafe},
    path::{Path, PathBuf},
};

const MAX_REPORTED_FAILURES: usize = 20;
const MAX_BMFF_BOXES: usize = 65_536;
const MAX_IPMA_ENTRIES: usize = 65_536;

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) struct ImageConversionProgress {
    pub(super) processed: usize,
    pub(super) total: usize,
    pub(super) converted: usize,
    pub(super) normalized: usize,
    pub(super) skipped: usize,
    pub(super) failed: usize,
    pub(super) current_file: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) struct ImageConversionSummary {
    pub(super) total: usize,
    pub(super) converted: usize,
    pub(super) normalized: usize,
    pub(super) skipped: usize,
    pub(super) failed: usize,
    pub(super) failed_files: Vec<String>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ConversionKind {
    Normalize,
    Bmp,
    WebP,
    Heif,
}

#[derive(Debug)]
struct ConversionCandidate {
    source: PathBuf,
    relative_path: PathBuf,
    kind: ConversionKind,
    target: Option<PathBuf>,
    conflict: Option<String>,
}

#[derive(Debug)]
struct DecodedForJpeg {
    image: DynamicImage,
    exif: Option<Vec<u8>>,
    icc_profile: Option<Vec<u8>>,
}

pub(super) fn convert_images_in_folder(
    folder: &Path,
    mut on_progress: impl FnMut(ImageConversionProgress),
) -> Result<ImageConversionSummary, AppError> {
    validate_traversal_root(folder)?;

    let mut candidates = discover_candidates(folder)?;
    mark_target_conflicts(folder, &mut candidates)?;
    let total = candidates.len();
    let mut summary = ImageConversionSummary {
        total,
        converted: 0,
        normalized: 0,
        skipped: 0,
        failed: 0,
        failed_files: Vec::new(),
    };
    on_progress(conversion_progress(0, &summary, None));

    let heic_decoder = HeicDecoder::new().with_decode_gain_map(false);
    for (index, candidate) in candidates.iter().enumerate() {
        let relative_path = display_path(&candidate.relative_path);
        on_progress(conversion_progress(
            index,
            &summary,
            Some(relative_path.clone()),
        ));

        let result = if let Some(conflict) = &candidate.conflict {
            Err(AppError::Message(conflict.clone()))
        } else {
            match catch_unwind(AssertUnwindSafe(|| {
                process_candidate(candidate, &heic_decoder)
            })) {
                Ok(result) => result,
                Err(payload) => Err(AppError::Message(format!(
                    "Image decoder stopped unexpectedly; the source was preserved: {}",
                    panic_message(payload.as_ref())
                ))),
            }
        };

        match result {
            Ok(ConversionOutcome::Converted) => summary.converted += 1,
            Ok(ConversionOutcome::Normalized) => summary.normalized += 1,
            Ok(ConversionOutcome::Skipped) => summary.skipped += 1,
            Err(error) => {
                summary.failed += 1;
                if summary.failed_files.len() < MAX_REPORTED_FAILURES {
                    summary
                        .failed_files
                        .push(format!("{relative_path}: {error}"));
                }
            }
        }
    }

    on_progress(conversion_progress(total, &summary, None));
    Ok(summary)
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ConversionOutcome {
    Converted,
    Normalized,
    Skipped,
}

fn conversion_progress(
    processed: usize,
    summary: &ImageConversionSummary,
    current_file: Option<String>,
) -> ImageConversionProgress {
    ImageConversionProgress {
        processed,
        total: summary.total,
        converted: summary.converted,
        normalized: summary.normalized,
        skipped: summary.skipped,
        failed: summary.failed,
        current_file,
    }
}

fn discover_candidates(folder: &Path) -> Result<Vec<ConversionCandidate>, AppError> {
    let mut candidates = Vec::new();
    let mut directories = vec![folder.to_path_buf()];

    while let Some(directory) = directories.pop() {
        let mut entries = fs::read_dir(&directory)?.collect::<Result<Vec<_>, _>>()?;
        entries.sort_by_key(|entry| entry.file_name().to_string_lossy().to_ascii_lowercase());

        for entry in entries {
            let path = entry.path();
            let metadata = fs::symlink_metadata(&path)?;
            if metadata_is_reparse_point(&metadata) {
                continue;
            }
            if metadata.is_dir() {
                directories.push(path);
                continue;
            }
            if !metadata.is_file() {
                continue;
            }
            let Some(kind) = conversion_kind(&path) else {
                continue;
            };
            let relative_path = path
                .strip_prefix(folder)
                .map(Path::to_path_buf)
                .map_err(|_| {
                    AppError::Message(format!(
                        "Discovered image is outside the selected folder: {}",
                        display_path(&path)
                    ))
                })?;
            let target = (kind != ConversionKind::Normalize).then(|| path.with_extension("jpg"));
            candidates.push(ConversionCandidate {
                source: path,
                relative_path,
                kind,
                target,
                conflict: None,
            });
        }
    }

    candidates.sort_by(|left, right| {
        path_collision_key(&left.relative_path).cmp(&path_collision_key(&right.relative_path))
    });
    Ok(candidates)
}

fn conversion_kind(path: &Path) -> Option<ConversionKind> {
    match path
        .extension()
        .and_then(|extension| extension.to_str())?
        .to_ascii_lowercase()
        .as_str()
    {
        "jpg" | "jpeg" | "png" => Some(ConversionKind::Normalize),
        "bmp" => Some(ConversionKind::Bmp),
        "webp" => Some(ConversionKind::WebP),
        "heif" | "heic" => Some(ConversionKind::Heif),
        _ => None,
    }
}

fn mark_target_conflicts(
    folder: &Path,
    candidates: &mut [ConversionCandidate],
) -> Result<(), AppError> {
    let occupied_paths = discover_occupied_paths(folder)?;
    let mut target_counts = HashMap::<String, usize>::new();
    for candidate in candidates.iter() {
        if let Some(target) = &candidate.target {
            *target_counts.entry(path_collision_key(target)).or_default() += 1;
        }
    }

    for candidate in candidates {
        let Some(target) = &candidate.target else {
            continue;
        };
        let target_key = path_collision_key(target);
        let collision_count = target_counts.get(&target_key).copied().unwrap_or_default();
        if collision_count > 1 {
            candidate.conflict = Some(format!(
                "More than one source image would create {}",
                display_path(target)
            ));
        } else if occupied_paths.contains(&target_key) || target.try_exists()? {
            candidate.conflict = Some(format!(
                "Destination image already exists and was not overwritten: {}",
                display_path(target)
            ));
        }
    }
    Ok(())
}

fn discover_occupied_paths(folder: &Path) -> Result<HashSet<String>, AppError> {
    let mut paths = HashSet::new();
    let mut directories = vec![folder.to_path_buf()];
    while let Some(directory) = directories.pop() {
        for entry in fs::read_dir(&directory)? {
            let entry = entry?;
            let path = entry.path();
            let metadata = fs::symlink_metadata(&path)?;
            if metadata_is_reparse_point(&metadata) {
                paths.insert(path_collision_key(&path));
            } else if metadata.is_dir() {
                directories.push(path);
            } else {
                paths.insert(path_collision_key(&path));
            }
        }
    }
    Ok(paths)
}

fn path_collision_key(path: &Path) -> String {
    path.as_os_str()
        .to_string_lossy()
        .replace('\\', "/")
        .to_lowercase()
}

fn process_candidate(
    candidate: &ConversionCandidate,
    heic_decoder: &HeicDecoder,
) -> Result<ConversionOutcome, AppError> {
    if candidate.kind == ConversionKind::Normalize {
        return normalize_image_orientation(&candidate.source).map(|changed| {
            if changed {
                ConversionOutcome::Normalized
            } else {
                ConversionOutcome::Skipped
            }
        });
    }

    let target = candidate
        .target
        .as_deref()
        .ok_or_else(|| AppError::Message("Conversion destination is missing".into()))?;
    let (mut source_guard, original_bytes) =
        LockedImageSource::open(&candidate.source)?.into_parts();
    let decoded = match candidate.kind {
        ConversionKind::Bmp => {
            decode_standard_image(&candidate.source, &original_bytes, ImageFormat::Bmp, false)?
        }
        ConversionKind::WebP => decode_webp(&candidate.source, &original_bytes)?,
        ConversionKind::Heif => decode_heif(&candidate.source, &original_bytes, heic_decoder)?,
        ConversionKind::Normalize => unreachable!(),
    };
    let write_result = write_converted_jpeg(&candidate.source, target, decoded, &mut source_guard);
    drop(source_guard);
    write_result?;
    Ok(ConversionOutcome::Converted)
}

fn decode_standard_image(
    path: &Path,
    bytes: &[u8],
    expected_format: ImageFormat,
    apply_exif_orientation: bool,
) -> Result<DecodedForJpeg, AppError> {
    let reader = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|error| image_error(path, "inspect image format", error))?;
    if reader.format() != Some(expected_format) {
        return Err(AppError::Message(format!(
            "File contents do not match the {} extension",
            expected_format.extensions_str()[0].to_ascii_uppercase()
        )));
    }
    let mut decoder = reader
        .into_decoder()
        .map_err(|error| image_error(path, "read image", error))?;
    validate_image_dimensions(path, decoder.dimensions())?;
    let exif = decoder
        .exif_metadata()
        .map_err(|error| image_error(path, "read EXIF metadata", error))?;
    let icc_profile = decoder
        .icc_profile()
        .map_err(|error| image_error(path, "read ICC profile", error))?;
    let (exif, orientation) = sanitize_exif(exif)?;
    let mut image = DynamicImage::from_decoder(decoder)
        .map_err(|error| image_error(path, "decode image", error))?;
    if apply_exif_orientation {
        image.apply_orientation(orientation);
    }
    Ok(DecodedForJpeg {
        image: flatten_alpha_onto_white(image),
        exif,
        icc_profile,
    })
}

fn decode_webp(path: &Path, bytes: &[u8]) -> Result<DecodedForJpeg, AppError> {
    let mut decoder = WebPDecoder::new(Cursor::new(bytes))
        .map_err(|error| image_error(path, "read WebP", error))?;
    if decoder.has_animation() {
        return Err(AppError::Message(
            "Animated WebP was preserved because converting it would discard frames".into(),
        ));
    }
    validate_image_dimensions(path, decoder.dimensions())?;
    let exif = decoder
        .exif_metadata()
        .map_err(|error| image_error(path, "read WebP EXIF metadata", error))?;
    let icc_profile = decoder
        .icc_profile()
        .map_err(|error| image_error(path, "read WebP ICC profile", error))?;
    let (exif, orientation) = sanitize_exif(exif)?;
    let mut image = DynamicImage::from_decoder(decoder)
        .map_err(|error| image_error(path, "decode WebP", error))?;
    image.apply_orientation(orientation);
    Ok(DecodedForJpeg {
        image: flatten_alpha_onto_white(image),
        exif,
        icc_profile,
    })
}

fn decode_heif(
    path: &Path,
    bytes: &[u8],
    decoder: &HeicDecoder,
) -> Result<DecodedForJpeg, AppError> {
    let transform_policy = inspect_heif_transform_policy(bytes)
        .map_err(|reason| AppError::Message(format!("{reason}; the source was preserved")))?;
    let decoded = decoder
        .decode(bytes)
        .map_err(|error| image_error(path, "decode HEIF/HEIC", error))?;
    let hpvcd::DecodedImage {
        width,
        height,
        pixels,
        alpha,
        bit_depth,
        color,
        orientation: container_orientation,
        exif,
        ..
    } = decoded;
    validate_decoded_heif_orientation(
        transform_policy.expected_container_orientation,
        container_orientation,
    )?;
    validate_image_dimensions(path, (width, height))?;
    let (exif, exif_orientation) = sanitize_exif(exif)?;
    let rgb = heic_pixels_to_rgb8(path, pixels, bit_depth.minus8())?;
    let alpha = heic_alpha_to_u8(path, alpha, bit_depth.minus8(), width, height)?;
    let rgb = composite_rgb_on_white(path, rgb, alpha.as_deref(), width, height)?;
    let rgb_image = RgbImage::from_raw(width, height, rgb).ok_or_else(|| {
        AppError::Message(format!(
            "Decoded HEIF/HEIC pixel count is invalid: {}",
            display_path(path)
        ))
    })?;
    let mut image = DynamicImage::ImageRgb8(rgb_image);
    apply_heif_exif_fallback(&mut image, container_orientation, exif_orientation);

    Ok(DecodedForJpeg {
        image,
        exif,
        icc_profile: color.icc,
    })
}

fn apply_heif_exif_fallback(
    image: &mut DynamicImage,
    container_orientation: HeicOrientation,
    exif_orientation: Orientation,
) {
    // hpvcd has already baked normative irot/imir container transforms into
    // the decoded pixels. EXIF is only a fallback when no container transform
    // exists, otherwise applying it again would rotate the image twice.
    if container_orientation == HeicOrientation::Normal {
        image.apply_orientation(exif_orientation);
    }
}

// hpvcd 0.3.2 correctly handles one standalone imir or irot property, but its
// transform composition loses information when both (or duplicates) apply to
// the primary item. Strictly parse pitm/ipma so transforms belonging only to a
// tile or auxiliary item do not reject an otherwise supported primary image.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct HeifTransformPolicy {
    expected_container_orientation: HeicOrientation,
}

#[derive(Clone, Copy, Debug)]
struct PrimaryHeifTransforms {
    mirror_count: usize,
    rotation_count: usize,
    mirror_orientation: Option<HeicOrientation>,
    rotation_orientation: Option<HeicOrientation>,
}

fn inspect_heif_transform_policy(bytes: &[u8]) -> Result<HeifTransformPolicy, &'static str> {
    if !contains_any_heif_transform_property(bytes) {
        return Ok(HeifTransformPolicy {
            expected_container_orientation: HeicOrientation::Normal,
        });
    }
    match inspect_primary_heif_transforms(bytes) {
        Ok(transforms)
            if (transforms.mirror_count > 0 && transforms.rotation_count > 0)
                || transforms.mirror_count > 1
                || transforms.rotation_count > 1 =>
        {
            Err("HEIF/HEIC primary item has combined or duplicate mirror/rotation properties that cannot be safely decoded together")
        }
        Ok(transforms) => Ok(HeifTransformPolicy {
            expected_container_orientation: transforms
                .mirror_orientation
                .or(transforms.rotation_orientation)
                .unwrap_or(HeicOrientation::Normal),
        }),
        Err(()) => Err("HEIF/HEIC transform metadata is malformed or unsupported"),
    }
}

fn validate_decoded_heif_orientation(
    expected: HeicOrientation,
    actual: HeicOrientation,
) -> Result<(), AppError> {
    if expected != actual {
        return Err(AppError::Message(format!(
            "HEIF/HEIC decoded container orientation {actual:?} does not match primary item metadata {expected:?}; the source was preserved"
        )));
    }
    Ok(())
}

fn contains_any_heif_transform_property(bytes: &[u8]) -> bool {
    any_bmff_box(bytes, |kind, payload| {
        if kind != *b"meta" || payload.len() < 4 {
            return false;
        }
        any_bmff_box(&payload[4..], |kind, payload| {
            kind == *b"iprp"
                && any_bmff_box(payload, |kind, payload| {
                    kind == *b"ipco"
                        && any_bmff_box(payload, |kind, _| kind == *b"imir" || kind == *b"irot")
                })
        })
    })
}

#[derive(Clone, Copy)]
struct BmffBox<'a> {
    kind: [u8; 4],
    payload: &'a [u8],
}

fn inspect_primary_heif_transforms(bytes: &[u8]) -> Result<PrimaryHeifTransforms, ()> {
    let top_level = parse_bmff_boxes(bytes)?;
    let mut meta_boxes = top_level.iter().filter(|item| item.kind == *b"meta");
    let meta = meta_boxes.next().ok_or(())?;
    if meta_boxes.next().is_some() || meta.payload.len() < 4 || meta.payload[..4] != [0, 0, 0, 0] {
        return Err(());
    }
    let meta_children = parse_bmff_boxes(&meta.payload[4..])?;
    let mut primary_boxes = meta_children.iter().filter(|item| item.kind == *b"pitm");
    let primary = primary_boxes.next().ok_or(())?;
    if primary_boxes.next().is_some()
        || primary.payload.len() != 6
        || primary.payload[..4] != [0, 0, 0, 0]
    {
        return Err(());
    }
    let primary_id = u16::from_be_bytes(primary.payload[4..6].try_into().map_err(|_| ())?);

    let property_containers: Vec<_> = meta_children
        .iter()
        .filter(|item| item.kind == *b"iprp")
        .collect();
    if property_containers.len() != 1 {
        return Err(());
    }
    let children = parse_bmff_boxes(property_containers[0].payload)?;
    let ipco_boxes: Vec<_> = children
        .iter()
        .filter(|item| item.kind == *b"ipco")
        .collect();
    if ipco_boxes.len() != 1 {
        return Err(());
    }
    let properties = parse_bmff_boxes(ipco_boxes[0].payload)?;
    if properties.len() > MAX_BMFF_BOXES
        || !properties
            .iter()
            .any(|item| item.kind == *b"imir" || item.kind == *b"irot")
    {
        return Err(());
    }

    let ipma_boxes: Vec<_> = children
        .iter()
        .filter(|item| item.kind == *b"ipma")
        .collect();
    if ipma_boxes.is_empty() {
        return Err(());
    }
    let mut primary_property_indices = HashSet::new();
    for association_box in ipma_boxes {
        parse_primary_ipma_associations(
            association_box.payload,
            primary_id,
            properties.len(),
            &mut primary_property_indices,
        )?;
    }

    let mut transforms = PrimaryHeifTransforms {
        mirror_count: 0,
        rotation_count: 0,
        mirror_orientation: None,
        rotation_orientation: None,
    };
    for property_index in primary_property_indices {
        let property = properties.get(property_index - 1).ok_or(())?;
        match property.kind {
            [b'i', b'm', b'i', b'r'] => {
                let &[axis] = property.payload else {
                    return Err(());
                };
                if axis & !1 != 0 {
                    return Err(());
                }
                transforms.mirror_count += 1;
                transforms.mirror_orientation = Some(if axis == 0 {
                    HeicOrientation::FlipH
                } else {
                    HeicOrientation::FlipV
                });
            }
            [b'i', b'r', b'o', b't'] => {
                let &[steps] = property.payload else {
                    return Err(());
                };
                if steps & !3 != 0 {
                    return Err(());
                }
                transforms.rotation_count += 1;
                transforms.rotation_orientation = Some(match steps {
                    0 => HeicOrientation::Normal,
                    1 => HeicOrientation::Rotate270,
                    2 => HeicOrientation::Rotate180,
                    3 => HeicOrientation::Rotate90,
                    _ => unreachable!("reserved bits were already rejected"),
                });
            }
            _ => {}
        }
    }
    Ok(transforms)
}

fn parse_primary_ipma_associations(
    payload: &[u8],
    primary_id: u16,
    property_count: usize,
    primary_property_indices: &mut HashSet<usize>,
) -> Result<(), ()> {
    if payload.len() < 8 || payload[..4] != [0, 0, 0, 0] {
        return Err(());
    }
    let entry_count = u32::from_be_bytes(payload[4..8].try_into().map_err(|_| ())?) as usize;
    let mut offset = 8_usize;
    if entry_count > MAX_IPMA_ENTRIES || entry_count > payload.len().saturating_sub(offset) / 3 {
        return Err(());
    }
    for _ in 0..entry_count {
        let item_id = read_be_u16_at(payload, &mut offset)?;
        let association_count = usize::from(read_u8_at(payload, &mut offset)?);
        if association_count > payload.len().saturating_sub(offset) {
            return Err(());
        }
        for _ in 0..association_count {
            let association = read_u8_at(payload, &mut offset)?;
            let property_index = usize::from(association & 0x7f);
            if property_index > property_count {
                return Err(());
            }
            if item_id == primary_id
                && property_index != 0
                && !primary_property_indices.insert(property_index)
            {
                return Err(());
            }
        }
    }
    (offset == payload.len()).then_some(()).ok_or(())
}

fn read_u8_at(bytes: &[u8], offset: &mut usize) -> Result<u8, ()> {
    let value = *bytes.get(*offset).ok_or(())?;
    *offset += 1;
    Ok(value)
}

fn read_be_u16_at(bytes: &[u8], offset: &mut usize) -> Result<u16, ()> {
    let end = offset.checked_add(2).ok_or(())?;
    let value = u16::from_be_bytes(
        bytes
            .get(*offset..end)
            .ok_or(())?
            .try_into()
            .map_err(|_| ())?,
    );
    *offset = end;
    Ok(value)
}

fn parse_bmff_boxes(mut bytes: &[u8]) -> Result<Vec<BmffBox<'_>>, ()> {
    let mut boxes = Vec::new();
    while !bytes.is_empty() {
        if boxes.len() >= MAX_BMFF_BOXES {
            return Err(());
        }
        if bytes.len() < 8 {
            return Err(());
        }
        let size32 = u32::from_be_bytes(bytes[..4].try_into().map_err(|_| ())?);
        let kind = bytes[4..8].try_into().map_err(|_| ())?;
        let (header_size, box_size) = match size32 {
            0 => (8_usize, bytes.len()),
            1 if bytes.len() >= 16 => {
                let size64 = u64::from_be_bytes(bytes[8..16].try_into().map_err(|_| ())?);
                (16, usize::try_from(size64).map_err(|_| ())?)
            }
            1 => return Err(()),
            size => (8, size as usize),
        };
        if box_size < header_size || box_size > bytes.len() {
            return Err(());
        }
        boxes.push(BmffBox {
            kind,
            payload: &bytes[header_size..box_size],
        });
        bytes = &bytes[box_size..];
    }
    Ok(boxes)
}

fn any_bmff_box(mut bytes: &[u8], mut predicate: impl FnMut([u8; 4], &[u8]) -> bool) -> bool {
    let mut inspected = 0_usize;
    while bytes.len() >= 8 {
        if inspected >= MAX_BMFF_BOXES {
            return false;
        }
        inspected += 1;
        let size32 = u32::from_be_bytes(bytes[..4].try_into().expect("box size is four bytes"));
        let kind: [u8; 4] = bytes[4..8].try_into().expect("box type is four bytes");
        let (header_size, box_size) = match size32 {
            0 => (8_usize, bytes.len()),
            1 if bytes.len() >= 16 => {
                let size64 = u64::from_be_bytes(
                    bytes[8..16]
                        .try_into()
                        .expect("large box size is eight bytes"),
                );
                let Ok(size) = usize::try_from(size64) else {
                    return false;
                };
                (16, size)
            }
            1 => return false,
            size => (8, size as usize),
        };
        if box_size < header_size || box_size > bytes.len() {
            return false;
        }
        if predicate(kind, &bytes[header_size..box_size]) {
            return true;
        }
        if size32 == 0 {
            return false;
        }
        bytes = &bytes[box_size..];
    }
    false
}

fn heic_pixels_to_rgb8(
    path: &Path,
    pixels: HeicImageBuffer,
    shift: u8,
) -> Result<Vec<u8>, AppError> {
    let rgb = match pixels {
        HeicImageBuffer::Rgb8(rgb) => rgb,
        HeicImageBuffer::Rgb16(rgb) => rgb
            .into_iter()
            .map(|sample| (sample >> shift) as u8)
            .collect(),
        HeicImageBuffer::Luma8(luma) => luma
            .into_iter()
            .flat_map(|sample| [sample, sample, sample])
            .collect(),
        HeicImageBuffer::Luma16(luma) => luma
            .into_iter()
            .flat_map(|sample| {
                let sample = (sample >> shift) as u8;
                [sample, sample, sample]
            })
            .collect(),
    };
    if rgb.len() % 3 != 0 {
        return Err(AppError::Message(format!(
            "Decoded HEIF/HEIC RGB buffer is invalid: {}",
            display_path(path)
        )));
    }
    Ok(rgb)
}

fn heic_alpha_to_u8(
    path: &Path,
    alpha: Option<HeicSampleBuf>,
    shift: u8,
    width: u32,
    height: u32,
) -> Result<Option<Vec<u8>>, AppError> {
    let Some(alpha) = alpha else {
        return Ok(None);
    };
    let alpha = match alpha {
        HeicSampleBuf::U8(alpha) => alpha,
        HeicSampleBuf::U16(alpha) => alpha
            .into_iter()
            .map(|sample| (sample >> shift) as u8)
            .collect(),
    };
    let expected = usize::try_from(u64::from(width) * u64::from(height)).map_err(|_| {
        AppError::Message(format!(
            "HEIF/HEIC alpha dimensions overflow: {}",
            display_path(path)
        ))
    })?;
    if alpha.len() != expected {
        return Err(AppError::Message(format!(
            "Decoded HEIF/HEIC alpha buffer is invalid: {}",
            display_path(path)
        )));
    }
    Ok(Some(alpha))
}

fn flatten_alpha_onto_white(image: DynamicImage) -> DynamicImage {
    if !image.color().has_alpha() {
        return DynamicImage::ImageRgb8(image.to_rgb8());
    }
    let rgba = image.to_rgba8();
    let mut rgb = Vec::with_capacity(rgba.width() as usize * rgba.height() as usize * 3);
    for pixel in rgba.pixels() {
        let alpha = u32::from(pixel[3]);
        for channel in &pixel.0[..3] {
            let blended = (u32::from(*channel) * alpha + 255 * (255 - alpha) + 127) / 255;
            rgb.push(blended as u8);
        }
    }
    DynamicImage::ImageRgb8(
        RgbImage::from_raw(rgba.width(), rgba.height(), rgb)
            .expect("RGBA pixels always produce the exact RGB buffer size"),
    )
}

fn composite_rgb_on_white(
    path: &Path,
    mut rgb: Vec<u8>,
    alpha: Option<&[u8]>,
    width: u32,
    height: u32,
) -> Result<Vec<u8>, AppError> {
    let pixel_count = usize::try_from(u64::from(width) * u64::from(height)).map_err(|_| {
        AppError::Message(format!(
            "Image dimensions overflow while compositing alpha: {}",
            display_path(path)
        ))
    })?;
    if rgb.len() != pixel_count.saturating_mul(3) {
        return Err(AppError::Message(format!(
            "Decoded image pixel buffer has the wrong length: {}",
            display_path(path)
        )));
    }
    let Some(alpha) = alpha else {
        return Ok(rgb);
    };
    if alpha.len() != pixel_count {
        return Err(AppError::Message(format!(
            "Decoded image alpha buffer has the wrong length: {}",
            display_path(path)
        )));
    }
    for (pixel, alpha) in rgb.chunks_exact_mut(3).zip(alpha.iter().copied()) {
        let alpha = u32::from(alpha);
        for channel in pixel {
            let blended = (u32::from(*channel) * alpha + 255 * (255 - alpha) + 127) / 255;
            *channel = blended as u8;
        }
    }
    Ok(rgb)
}

fn sanitize_exif(mut exif: Option<Vec<u8>>) -> Result<(Option<Vec<u8>>, Orientation), AppError> {
    let orientation = exif
        .as_deref()
        .and_then(Orientation::from_exif_chunk)
        .unwrap_or(Orientation::NoTransforms);
    if let Some(exif) = exif.as_mut() {
        if count_orientation_entries(exif)? > 0 {
            remove_orientation_entries(exif)?;
        }
    }
    Ok((exif, orientation))
}

fn write_converted_jpeg(
    source: &Path,
    target: &Path,
    decoded: DecodedForJpeg,
    source_guard: &mut ImageSourceGuard,
) -> Result<(), AppError> {
    if target.try_exists()? {
        return Err(AppError::Message(format!(
            "Destination image already exists and was not overwritten: {}",
            display_path(target)
        )));
    }

    let expected_dimensions = decoded.image.dimensions();
    let mut output_guard = create_locked_temporary_image(target)?;
    let temporary_path = output_guard.path().to_path_buf();
    let write_result = (|| -> Result<(), AppError> {
        {
            let mut writer = BufWriter::new(output_guard.file_mut());
            let mut encoder = JpegEncoder::new_with_quality(&mut writer, JPEG_QUALITY);
            if let Some(exif) = decoded.exif.clone() {
                encoder
                    .set_exif_metadata(exif)
                    .map_err(|error| image_error(source, "write EXIF metadata", error))?;
            }
            if let Some(icc_profile) = decoded.icc_profile.clone() {
                encoder
                    .set_icc_profile(icc_profile)
                    .map_err(|error| image_error(source, "write ICC profile", error))?;
            }
            decoded
                .image
                .write_with_encoder(encoder)
                .map_err(|error| image_error(source, "encode JPEG", error))?;
            writer.flush()?;
        }
        output_guard.file_mut().flush()?;
        output_guard.file_mut().sync_all()?;
        Ok(())
    })();

    if let Err(error) = write_result {
        return Err(discard_failed_output(output_guard, error));
    }
    let temporary_bytes = match output_guard.read_all_from_start() {
        Ok(bytes) => bytes,
        Err(error) => return Err(discard_failed_output(output_guard, error)),
    };
    if let Err(error) = verify_converted_jpeg(
        &temporary_path,
        &temporary_bytes,
        expected_dimensions,
        decoded.exif.as_deref(),
        decoded.icc_profile.as_deref(),
    ) {
        return Err(discard_failed_output(output_guard, error));
    }

    if let Err(error) = output_guard.rename_exact(target) {
        return Err(discard_failed_output(output_guard, error.into()));
    }
    if let Err(error) = source_guard.mark_delete() {
        let published_path = output_guard.path().to_path_buf();
        if let Err(rollback_error) = output_guard.mark_delete() {
            return Err(AppError::Message(format!(
                "JPEG was created at {}, but the exact original could not be deleted ({error}) and the exact JPEG rollback also failed ({rollback_error}); both files remain",
                display_path(&published_path)
            )));
        }
        drop(output_guard);
        return Err(AppError::Message(format!(
            "The exact original could not be deleted after conversion ({error}); the new JPEG was rolled back and the original was preserved: {}",
            display_path(source_guard.path())
        )));
    }
    drop(output_guard);
    Ok(())
}

fn discard_failed_output(mut output_guard: ImageSourceGuard, original_error: AppError) -> AppError {
    let output_path = output_guard.path().to_path_buf();
    if let Err(cleanup_error) = output_guard.mark_delete() {
        return AppError::Message(format!(
            "{original_error}; temporary output cleanup also failed for {}: {cleanup_error}",
            display_path(&output_path)
        ));
    }
    drop(output_guard);
    original_error
}

fn verify_converted_jpeg(
    path: &Path,
    bytes: &[u8],
    expected_dimensions: (u32, u32),
    expected_exif: Option<&[u8]>,
    expected_icc: Option<&[u8]>,
) -> Result<(), AppError> {
    let reader = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|error| image_error(path, "verify JPEG format", error))?;
    if reader.format() != Some(ImageFormat::Jpeg) {
        return Err(AppError::Message(format!(
            "Converted file is not JPEG: {}",
            display_path(path)
        )));
    }
    let mut decoder = reader
        .into_decoder()
        .map_err(|error| image_error(path, "verify JPEG", error))?;
    if decoder.dimensions() != expected_dimensions {
        return Err(AppError::Message(format!(
            "Converted JPEG dimensions changed unexpectedly: {}",
            display_path(path)
        )));
    }
    let actual_exif = decoder
        .exif_metadata()
        .map_err(|error| image_error(path, "verify EXIF metadata", error))?;
    if actual_exif.as_deref() != expected_exif {
        return Err(AppError::Message(format!(
            "Converted JPEG did not preserve the edited EXIF metadata: {}",
            display_path(path)
        )));
    }
    if actual_exif
        .as_deref()
        .is_some_and(|exif| count_orientation_entries(exif).unwrap_or(1) != 0)
    {
        return Err(AppError::Message(format!(
            "Converted JPEG still contains an EXIF orientation tag: {}",
            display_path(path)
        )));
    }
    let actual_icc = decoder
        .icc_profile()
        .map_err(|error| image_error(path, "verify ICC profile", error))?;
    if actual_icc.as_deref() != expected_icc {
        return Err(AppError::Message(format!(
            "Converted JPEG did not preserve its ICC profile: {}",
            display_path(path)
        )));
    }
    let decoded = DynamicImage::from_decoder(decoder)
        .map_err(|error| image_error(path, "fully decode the converted JPEG", error))?;
    if decoded.dimensions() != expected_dimensions {
        return Err(AppError::Message(format!(
            "Converted JPEG could not be verified: {}",
            display_path(path)
        )));
    }
    Ok(())
}

fn image_error(path: &Path, operation: &str, error: impl std::fmt::Display) -> AppError {
    AppError::Message(format!(
        "Failed to {operation} for {}: {error}",
        display_path(path)
    ))
}

fn panic_message(payload: &(dyn Any + Send)) -> &str {
    payload
        .downcast_ref::<&str>()
        .copied()
        .or_else(|| payload.downcast_ref::<String>().map(String::as_str))
        .unwrap_or("unknown decoder panic")
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{
        codecs::{png::PngEncoder, webp::WebPEncoder},
        ImageBuffer, Luma, Rgb, Rgba,
    };
    use std::time::{SystemTime, UNIX_EPOCH};

    const ANIMATED_WEBP: &[u8] = &[
        82, 73, 70, 70, 158, 0, 0, 0, 87, 69, 66, 80, 86, 80, 56, 88, 10, 0, 0, 0, 18, 0, 0, 0, 1,
        0, 0, 1, 0, 0, 65, 78, 73, 77, 6, 0, 0, 0, 255, 255, 255, 255, 0, 0, 65, 78, 77, 70, 54, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 244, 1, 0, 2, 86, 80, 56, 76, 30, 0, 0, 0, 47, 1,
        64, 0, 0, 23, 48, 255, 2, 130, 34, 255, 71, 155, 255, 249, 15, 52, 11, 10, 219, 182, 65,
        97, 113, 16, 209, 255, 200, 3, 65, 78, 77, 70, 52, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1,
        0, 0, 244, 1, 0, 0, 86, 80, 56, 76, 28, 0, 0, 0, 47, 1, 64, 0, 16, 23, 32, 16, 72, 97, 147,
        63, 255, 2, 130, 34, 255, 71, 155, 255, 128, 189, 193, 24, 68, 244, 63, 4,
    ];

    fn test_directory(name: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "amb82-image-conversion-{name}-{}-{nonce}",
            std::process::id()
        ))
    }

    fn sample_rgb() -> RgbImage {
        ImageBuffer::from_fn(2, 3, |x, y| {
            Rgb([x as u8 * 80 + 20, y as u8 * 60 + 10, (x + y) as u8 * 40])
        })
    }

    fn test_exif(orientation: u16) -> Vec<u8> {
        let mut exif = vec![0_u8; 8 + 2 + 12 + 4];
        exif[..4].copy_from_slice(&[b'I', b'I', 42, 0]);
        exif[4..8].copy_from_slice(&8_u32.to_le_bytes());
        exif[8..10].copy_from_slice(&1_u16.to_le_bytes());
        exif[10..12].copy_from_slice(&0x0112_u16.to_le_bytes());
        exif[12..14].copy_from_slice(&3_u16.to_le_bytes());
        exif[14..18].copy_from_slice(&1_u32.to_le_bytes());
        exif[18..20].copy_from_slice(&orientation.to_le_bytes());
        exif
    }

    fn write_png(path: &Path, exif: Option<Vec<u8>>) {
        let file = fs::File::create(path).unwrap();
        let mut encoder = PngEncoder::new(BufWriter::new(file));
        if let Some(exif) = exif {
            encoder.set_exif_metadata(exif).unwrap();
        }
        DynamicImage::ImageRgb8(sample_rgb())
            .write_with_encoder(encoder)
            .unwrap();
    }

    fn write_bmp(path: &Path) {
        DynamicImage::ImageRgb8(sample_rgb())
            .save_with_format(path, ImageFormat::Bmp)
            .unwrap();
    }

    fn write_webp(path: &Path, exif: Option<Vec<u8>>) {
        let file = fs::File::create(path).unwrap();
        let mut encoder = WebPEncoder::new_lossless(BufWriter::new(file));
        if let Some(exif) = exif {
            encoder.set_exif_metadata(exif).unwrap();
        }
        DynamicImage::ImageRgba8(ImageBuffer::from_fn(2, 3, |x, y| {
            Rgba([
                x as u8 * 90,
                y as u8 * 70,
                30,
                if x == 0 { 128 } else { 255 },
            ])
        }))
        .write_with_encoder(encoder)
        .unwrap();
    }

    fn jpeg_metadata(path: &Path) -> (ImageFormat, (u32, u32), Option<Vec<u8>>) {
        let bytes = fs::read(path).unwrap();
        let reader = ImageReader::new(Cursor::new(bytes))
            .with_guessed_format()
            .unwrap();
        let format = reader.format().unwrap();
        let mut decoder = reader.into_decoder().unwrap();
        let dimensions = decoder.dimensions();
        let exif = decoder.exif_metadata().unwrap();
        DynamicImage::from_decoder(decoder).unwrap();
        (format, dimensions, exif)
    }

    #[test]
    fn recursively_converts_bmp_and_skips_unchanged_png() {
        let root = test_directory("recursive");
        let nested = root.join("one").join("two");
        fs::create_dir_all(&nested).unwrap();
        let bmp = nested.join("source.BMP");
        let jpeg = nested.join("source.jpg");
        write_bmp(&bmp);
        write_png(&root.join("keep.png"), None);
        fs::write(root.join("ignored.gif"), b"not part of the conversion").unwrap();
        let mut progress = Vec::new();

        let summary = convert_images_in_folder(&root, |item| progress.push(item)).unwrap();

        assert_eq!(summary.total, 2);
        assert_eq!(summary.converted, 1);
        assert_eq!(summary.skipped, 1);
        assert_eq!(summary.failed, 0);
        assert!(!bmp.exists());
        assert_eq!(jpeg_metadata(&jpeg).0, ImageFormat::Jpeg);
        assert_eq!(progress.first().unwrap().processed, 0);
        assert_eq!(progress.last().unwrap().processed, 2);
        assert!(progress
            .iter()
            .any(|item| item.current_file.as_deref() == Some("one\\two\\source.BMP")));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn destination_collision_preserves_both_sources() {
        let root = test_directory("collision");
        fs::create_dir_all(&root).unwrap();
        let bmp = root.join("photo.bmp");
        let jpeg = root.join("photo.JPG");
        write_bmp(&bmp);
        DynamicImage::ImageRgb8(sample_rgb())
            .save_with_format(&jpeg, ImageFormat::Jpeg)
            .unwrap();
        let bmp_before = fs::read(&bmp).unwrap();
        let jpeg_before = fs::read(&jpeg).unwrap();

        let summary = convert_images_in_folder(&root, |_| {}).unwrap();

        assert_eq!(summary.total, 2);
        assert_eq!(summary.converted, 0);
        assert_eq!(summary.skipped, 1);
        assert_eq!(summary.failed, 1);
        assert_eq!(fs::read(&bmp).unwrap(), bmp_before);
        assert_eq!(fs::read(&jpeg).unwrap(), jpeg_before);
        assert!(summary.failed_files[0].contains("already exists"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn corrupt_source_is_preserved_and_scan_continues() {
        let root = test_directory("corrupt");
        fs::create_dir_all(&root).unwrap();
        let broken = root.join("broken.webp");
        let bmp = root.join("valid.bmp");
        fs::write(&broken, b"not a WebP image").unwrap();
        write_bmp(&bmp);
        let broken_before = fs::read(&broken).unwrap();

        let summary = convert_images_in_folder(&root, |_| {}).unwrap();

        assert_eq!(summary.converted, 1);
        assert_eq!(summary.failed, 1);
        assert_eq!(fs::read(&broken).unwrap(), broken_before);
        assert!(!root.join("broken.jpg").exists());
        assert!(root.join("valid.jpg").exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn oriented_webp_is_baked_into_verified_jpeg() {
        let root = test_directory("webp-orientation");
        fs::create_dir_all(&root).unwrap();
        let webp = root.join("oriented.webp");
        let jpeg = root.join("oriented.jpg");
        write_webp(&webp, Some(test_exif(6)));

        let summary = convert_images_in_folder(&root, |_| {}).unwrap();

        assert_eq!(summary.converted, 1);
        assert_eq!(summary.failed, 0);
        assert!(!webp.exists());
        let (format, dimensions, exif) = jpeg_metadata(&jpeg);
        assert_eq!(format, ImageFormat::Jpeg);
        assert_eq!(dimensions, (3, 2));
        assert_eq!(
            count_orientation_entries(exif.as_deref().unwrap()).unwrap(),
            0
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn existing_png_uses_shared_orientation_normalizer() {
        let root = test_directory("png-orientation");
        fs::create_dir_all(&root).unwrap();
        let png = root.join("oriented.png");
        write_png(&png, Some(test_exif(6)));

        let summary = convert_images_in_folder(&root, |_| {}).unwrap();

        assert_eq!(summary.normalized, 1);
        assert_eq!(summary.converted, 0);
        assert_eq!(summary.failed, 0);
        let bytes = fs::read(&png).unwrap();
        let reader = ImageReader::new(Cursor::new(bytes))
            .with_guessed_format()
            .unwrap();
        assert_eq!(reader.format(), Some(ImageFormat::Png));
        let mut decoder = reader.into_decoder().unwrap();
        assert_eq!(decoder.dimensions(), (3, 2));
        let exif = decoder.exif_metadata().unwrap().unwrap();
        assert_eq!(count_orientation_entries(&exif).unwrap(), 0);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn animated_webp_is_rejected_without_changing_source() {
        let root = test_directory("animated-webp");
        fs::create_dir_all(&root).unwrap();
        let webp = root.join("animated.webp");
        fs::write(&webp, ANIMATED_WEBP).unwrap();

        let summary = convert_images_in_folder(&root, |_| {}).unwrap();

        assert_eq!(summary.total, 1);
        assert_eq!(summary.failed, 1);
        assert_eq!(fs::read(&webp).unwrap(), ANIMATED_WEBP);
        assert!(!root.join("animated.jpg").exists());
        assert!(summary.failed_files[0].contains("Animated WebP"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn malformed_heic_is_contained_and_preserved() {
        let root = test_directory("heic-failure");
        fs::create_dir_all(&root).unwrap();
        let heic = root.join("broken.heic");
        let bytes = b"not a HEIF container";
        fs::write(&heic, bytes).unwrap();

        let summary = convert_images_in_folder(&root, |_| {}).unwrap();

        assert_eq!(summary.failed, 1);
        assert_eq!(fs::read(&heic).unwrap(), bytes);
        assert!(!root.join("broken.jpg").exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn real_heic_fixture_converts_when_available() {
        let fixture = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join("image-conversion-fixtures")
            .join("crowd_1440x960.heic");
        if !fixture.exists() {
            return;
        }
        let root = test_directory("real-heic");
        fs::create_dir_all(&root).unwrap();
        let heic = root.join("crowd.heic");
        let jpeg = root.join("crowd.jpg");
        fs::copy(fixture, &heic).unwrap();

        let summary = convert_images_in_folder(&root, |_| {}).unwrap();

        assert_eq!(summary.converted, 1, "{:?}", summary.failed_files);
        assert_eq!(summary.failed, 0, "{:?}", summary.failed_files);
        assert!(!heic.exists());
        let (format, dimensions, exif) = jpeg_metadata(&jpeg);
        assert_eq!(format, ImageFormat::Jpeg);
        assert_eq!(dimensions, (1440, 960));
        if let Some(exif) = exif {
            assert_eq!(count_orientation_entries(&exif).unwrap(), 0);
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn heif_normal_container_applies_exif_fallback_and_removes_tag() {
        let (sanitized_exif, orientation) = sanitize_exif(Some(test_exif(6))).unwrap();
        assert_eq!(
            count_orientation_entries(sanitized_exif.as_deref().unwrap()).unwrap(),
            0
        );
        let mut image = DynamicImage::ImageLuma8(
            ImageBuffer::<Luma<u8>, _>::from_raw(2, 3, vec![1, 2, 3, 4, 5, 6]).unwrap(),
        );

        apply_heif_exif_fallback(&mut image, HeicOrientation::Normal, orientation);

        assert_eq!(image.dimensions(), (3, 2));
        assert_eq!(image.to_luma8().as_raw(), &[5, 3, 1, 6, 4, 2]);
    }

    #[test]
    fn heif_container_transform_does_not_apply_exif_twice() {
        let mut already_oriented = DynamicImage::ImageLuma8(
            ImageBuffer::<Luma<u8>, _>::from_raw(3, 2, vec![5, 3, 1, 6, 4, 2]).unwrap(),
        );

        apply_heif_exif_fallback(
            &mut already_oriented,
            HeicOrientation::Rotate90,
            Orientation::Rotate90,
        );

        assert_eq!(already_oriented.dimensions(), (3, 2));
        assert_eq!(already_oriented.to_luma8().as_raw(), &[5, 3, 1, 6, 4, 2]);
        assert!(validate_decoded_heif_orientation(
            HeicOrientation::Rotate90,
            HeicOrientation::Rotate90
        )
        .is_ok());
        assert!(validate_decoded_heif_orientation(
            HeicOrientation::Rotate90,
            HeicOrientation::Rotate270
        )
        .is_err());
    }

    #[test]
    fn standalone_heif_mirror_is_allowed_but_combined_rotation_is_rejected() {
        fn bmff_box(kind: [u8; 4], payload: &[u8]) -> Vec<u8> {
            let mut output = Vec::with_capacity(payload.len() + 8);
            output.extend_from_slice(&u32::try_from(payload.len() + 8).unwrap().to_be_bytes());
            output.extend_from_slice(&kind);
            output.extend_from_slice(payload);
            output
        }

        fn heif_properties(
            properties: &[([u8; 4], Vec<u8>)],
            primary_associations: &[u8],
            auxiliary_associations: &[u8],
        ) -> Vec<u8> {
            let mut property_payload = Vec::new();
            for (kind, payload) in properties {
                property_payload.extend_from_slice(&bmff_box(*kind, payload));
            }
            let property_container = bmff_box(*b"ipco", &property_payload);

            let mut association_payload = vec![0_u8; 4];
            association_payload.extend_from_slice(&2_u32.to_be_bytes());
            for (item_id, associations) in [
                (1_u16, primary_associations),
                (2_u16, auxiliary_associations),
            ] {
                association_payload.extend_from_slice(&item_id.to_be_bytes());
                association_payload.push(u8::try_from(associations.len()).unwrap());
                association_payload.extend_from_slice(associations);
            }
            let associations = bmff_box(*b"ipma", &association_payload);
            let mut property_group = associations;
            property_group.extend_from_slice(&property_container);
            let properties = bmff_box(*b"iprp", &property_group);

            let mut meta_payload = vec![0_u8; 4];
            meta_payload.extend_from_slice(&bmff_box(*b"pitm", &[0, 0, 0, 0, 0, 1]));
            meta_payload.extend_from_slice(&properties);
            bmff_box(*b"meta", &meta_payload)
        }

        let mirrored = heif_properties(&[(*b"imir", vec![0])], &[0x81], &[]);
        let rotated = heif_properties(&[(*b"irot", vec![1])], &[0x81], &[]);
        let combined = heif_properties(
            &[(*b"imir", vec![0]), (*b"irot", vec![1])],
            &[0x81, 0x82],
            &[],
        );
        let duplicate_mirror = heif_properties(
            &[(*b"imir", vec![0]), (*b"imir", vec![1])],
            &[0x81, 0x82],
            &[],
        );
        let duplicate_same_property = heif_properties(&[(*b"imir", vec![0])], &[0x81, 0x81], &[]);
        let split_between_primary_and_auxiliary = heif_properties(
            &[(*b"irot", vec![1]), (*b"imir", vec![0])],
            &[0x81],
            &[0x82],
        );
        let unassociated = heif_properties(&[(*b"imir", vec![0]), (*b"irot", vec![1])], &[], &[]);
        let invalid_reserved_bits = heif_properties(&[(*b"imir", vec![0x80])], &[0x81], &[]);
        let invalid_payload_length = heif_properties(&[(*b"irot", vec![1, 0])], &[0x81], &[]);
        let out_of_range_association = heif_properties(&[(*b"imir", vec![0])], &[0x82], &[]);
        let mirrored_meta = parse_bmff_boxes(&mirrored).unwrap()[0];
        let mirrored_meta_children = parse_bmff_boxes(&mirrored_meta.payload[4..]).unwrap();
        let iprp = mirrored_meta_children
            .iter()
            .find(|item| item.kind == *b"iprp")
            .unwrap();
        let mut multiple_iprp_payload = mirrored_meta.payload.to_vec();
        multiple_iprp_payload.extend_from_slice(&bmff_box(*b"iprp", iprp.payload));
        let multiple_iprp = bmff_box(*b"meta", &multiple_iprp_payload);

        assert_eq!(
            inspect_heif_transform_policy(&mirrored)
                .unwrap()
                .expected_container_orientation,
            HeicOrientation::FlipH
        );
        assert_eq!(
            inspect_heif_transform_policy(&rotated)
                .unwrap()
                .expected_container_orientation,
            HeicOrientation::Rotate270
        );
        assert!(inspect_heif_transform_policy(&combined).is_err());
        assert!(inspect_heif_transform_policy(&duplicate_mirror).is_err());
        assert!(inspect_heif_transform_policy(&duplicate_same_property).is_err());
        assert_eq!(
            inspect_heif_transform_policy(&split_between_primary_and_auxiliary)
                .unwrap()
                .expected_container_orientation,
            HeicOrientation::Rotate270
        );
        assert_eq!(
            inspect_heif_transform_policy(&unassociated)
                .unwrap()
                .expected_container_orientation,
            HeicOrientation::Normal
        );
        assert!(inspect_heif_transform_policy(&invalid_reserved_bits).is_err());
        assert!(inspect_heif_transform_policy(&invalid_payload_length).is_err());
        assert!(inspect_heif_transform_policy(&out_of_range_association).is_err());
        assert!(inspect_heif_transform_policy(&multiple_iprp).is_err());
        assert_eq!(
            inspect_heif_transform_policy(b"unstructured imir and irot markers")
                .unwrap()
                .expected_container_orientation,
            HeicOrientation::Normal
        );

        let root = test_directory("combined-heic-transform");
        fs::create_dir_all(&root).unwrap();
        let source = root.join("combined.heic");
        fs::write(&source, &combined).unwrap();

        let summary = convert_images_in_folder(&root, |_| {}).unwrap();

        assert_eq!(summary.failed, 1);
        assert_eq!(fs::read(&source).unwrap(), combined);
        assert!(!root.join("combined.jpg").exists());
        assert!(summary.failed_files[0].contains("combined or duplicate"));
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(windows)]
    #[test]
    #[allow(clippy::permissions_set_readonly_false)]
    fn source_delete_failure_rolls_back_new_jpeg() {
        let root = test_directory("delete-rollback");
        fs::create_dir_all(&root).unwrap();
        let bmp = root.join("readonly.bmp");
        let jpeg = root.join("readonly.jpg");
        write_bmp(&bmp);
        let before = fs::read(&bmp).unwrap();
        let mut permissions = fs::metadata(&bmp).unwrap().permissions();
        permissions.set_readonly(true);
        fs::set_permissions(&bmp, permissions).unwrap();

        let summary = convert_images_in_folder(&root, |_| {}).unwrap();

        assert_eq!(summary.failed, 1);
        assert_eq!(fs::read(&bmp).unwrap(), before);
        assert!(!jpeg.exists());
        assert!(summary.failed_files[0].contains("rolled back"));
        let mut permissions = fs::metadata(&bmp).unwrap().permissions();
        permissions.set_readonly(false);
        fs::set_permissions(&bmp, permissions).unwrap();
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn active_writer_prevents_conversion_and_preserves_source() {
        use std::os::windows::fs::OpenOptionsExt;
        use windows_sys::Win32::Storage::FileSystem::{
            FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE,
        };

        let root = test_directory("writer-lock");
        fs::create_dir_all(&root).unwrap();
        let bmp = root.join("writer.bmp");
        write_bmp(&bmp);
        let before = fs::read(&bmp).unwrap();
        let writer = fs::OpenOptions::new()
            .read(true)
            .write(true)
            .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE)
            .open(&bmp)
            .unwrap();

        let summary = convert_images_in_folder(&root, |_| {}).unwrap();

        assert_eq!(summary.failed, 1);
        assert_eq!(fs::read(&bmp).unwrap(), before);
        assert!(!root.join("writer.jpg").exists());
        drop(writer);
        fs::remove_dir_all(root).unwrap();
    }
}
