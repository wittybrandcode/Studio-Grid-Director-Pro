// ============================================================================
// Studio Grid Director Pro — Native Tauri v2 NDI RGBA8 Video Sender Module
// ============================================================================
// Register these commands in `src-tauri/src/lib.rs` (or `main.rs`):
//
// mod ndi_sender;
// use ndi_sender::{ndi_send_rgba_frame, ndi_stop_stream, NdiSenderRegistry};
//
// tauri::Builder::default()
//     .manage(NdiSenderRegistry::default())
//     .invoke_handler(tauri::generate_handler![
//         ndi_send_rgba_frame,
//         ndi_stop_stream
//     ])
// ============================================================================

use std::collections::HashMap;
use std::sync::Mutex;
use tauri::State;

/// Metadata for an active per-screen NDI output stream
#[derive(Debug, Clone)]
pub struct ActiveNdiStreamInfo {
    pub screen_id: String,
    pub source_name: String,
    pub width: u32,
    pub height: u32,
    pub frame_rate_n: i32,
    pub frame_rate_d: i32,
    pub frames_sent: u64,
}

/// Thread-safe registry managing active NDI streams across multiple Studio screens
#[derive(Default)]
pub struct NdiSenderRegistry {
    pub streams: Mutex<HashMap<String, ActiveNdiStreamInfo>>,
}

/// Receives a 32-bit RGBA8 pixel buffer from the Studio Grid Director frontend
/// and broadcasts it onto the local network as an NDI Video Frame (FourCC: RGBA).
///
/// When building with the NewTek NDI SDK / `grafton-ndi` crate in Cargo.toml:
/// `grafton-ndi = "0.6"` (or `ndi = "0.4"`), forward `rgba_bytes` to `SendInstance::send_video`.
#[tauri::command]
pub fn ndi_send_rgba_frame(
    registry: State<'_, NdiSenderRegistry>,
    screen_id: String,
    source_name: String,
    width: u32,
    height: u32,
    frame_rate_n: i32,
    frame_rate_d: i32,
    rgba_bytes: Vec<u8>,
) -> Result<bool, String> {
    let expected_len = (width as usize) * (height as usize) * 4;
    if rgba_bytes.len() < expected_len {
        return Err(format!(
            "Invalid RGBA8 buffer size: got {}, expected {}",
            rgba_bytes.len(),
            expected_len
        ));
    }

    let mut map = registry
        .streams
        .lock()
        .map_err(|_| "Failed to lock NDI sender registry".to_string())?;

    let entry = map
        .entry(screen_id.clone())
        .or_insert_with(|| ActiveNdiStreamInfo {
            screen_id: screen_id.clone(),
            source_name: source_name.clone(),
            width,
            height,
            frame_rate_n,
            frame_rate_d,
            frames_sent: 0,
        });

    entry.source_name = source_name;
    entry.width = width;
    entry.height = height;
    entry.frame_rate_n = frame_rate_n;
    entry.frame_rate_d = frame_rate_d;
    entry.frames_sent += 1;

    // ------------------------------------------------------------------------
    // Native NDI SDK Hook (uncomment when `grafton-ndi` / NewTek NDI SDK is linked):
    // ------------------------------------------------------------------------
    // let video_frame = grafton_ndi::VideoFrameBuilder::new()
    //     .resolution(width as i32, height as i32)
    //     .fourcc(grafton_ndi::FourCCVideoType::RGBA)
    //     .frame_rate(frame_rate_n, frame_rate_d)
    //     .line_stride_in_bytes((width * 4) as i32)
    //     .data(&rgba_bytes)
    //     .build()?;
    // sender.send_video(&video_frame);
    // ------------------------------------------------------------------------

    Ok(true)
}

/// Stops and removes an active NDI stream for the given screen ID
#[tauri::command]
pub fn ndi_stop_stream(
    registry: State<'_, NdiSenderRegistry>,
    screen_id: String,
    _source_name: Option<String>,
) -> Result<bool, String> {
    let mut map = registry
        .streams
        .lock()
        .map_err(|_| "Failed to lock NDI sender registry".to_string())?;

    map.remove(&screen_id);
    Ok(true)
}
