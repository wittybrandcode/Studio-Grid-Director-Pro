// ============================================================================
// Studio Grid Director Pro — Native Tauri v2 NDI RGBA8 Video Sender Module
// ============================================================================
// Optional native NDI SDK integration is gated behind the `ndi-sdk` Cargo
// feature (`cargo build --features ndi-sdk`), which requires the NewTek NDI SDK
// to be installed on the host build environment.
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
    #[cfg(feature = "ndi-sdk")]
    pub senders: Mutex<HashMap<String, grafton_ndi::SendInstance>>,
}

/// Receives a 32-bit RGBA8 pixel buffer from the Studio Grid Director frontend
/// and broadcasts it onto the local network as an NDI Video Frame (FourCC: RGBA)
/// when compiled with `--features ndi-sdk`.
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
    if width == 0 || height == 0 {
        return Err("Invalid frame dimensions: width and height must be > 0".to_string());
    }

    let expected_len = (width as usize)
        .checked_mul(height as usize)
        .and_then(|px| px.checked_mul(4))
        .ok_or_else(|| "Frame dimensions overflow buffer calculation".to_string())?;

    if rgba_bytes.len() < expected_len {
        return Err(format!(
            "Invalid RGBA8 buffer size: got {}, expected {}",
            rgba_bytes.len(),
            expected_len
        ));
    }

    {
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

        entry.source_name = source_name.clone();
        entry.width = width;
        entry.height = height;
        entry.frame_rate_n = frame_rate_n;
        entry.frame_rate_d = frame_rate_d;
        entry.frames_sent += 1;
    }

    #[cfg(feature = "ndi-sdk")]
    {
        let mut senders = registry
            .senders
            .lock()
            .map_err(|_| "Failed to lock NDI SDK senders".to_string())?;

        if !senders.contains_key(&screen_id) {
            let instance = grafton_ndi::NDI::new()
                .map_err(|e| format!("Failed to initialize NewTek NDI SDK: {e}"))?;
            let create_opts = grafton_ndi::SendOptions::builder()
                .ndi_name(&source_name)
                .clock_video(false)
                .build();
            let sender = grafton_ndi::SendInstance::new(&instance, &create_opts)
                .map_err(|e| format!("Failed to create NDI SendInstance: {e}"))?;
            senders.insert(screen_id.clone(), sender);
        }

        if let Some(sender) = senders.get(&screen_id) {
            let video_frame = grafton_ndi::VideoFrameBuilder::new()
                .resolution(width as i32, height as i32)
                .fourcc(grafton_ndi::FourCCVideoType::RGBA)
                .frame_rate(frame_rate_n, frame_rate_d)
                .line_stride_in_bytes((width * 4) as i32)
                .data(&rgba_bytes[..expected_len])
                .build()
                .map_err(|e| format!("Failed to build NDI VideoFrame: {e}"))?;
            sender.send_video(&video_frame);
        }
        return Ok(true);
    }

    #[cfg(not(feature = "ndi-sdk"))]
    {
        let _ = rgba_bytes;
        Ok(false)
    }
}

/// Stops and removes an active NDI stream for the given screen ID
#[tauri::command]
pub fn ndi_stop_stream(
    registry: State<'_, NdiSenderRegistry>,
    screen_id: String,
    _source_name: Option<String>,
) -> Result<bool, String> {
    if let Ok(mut map) = registry.streams.lock() {
        map.remove(&screen_id);
    }

    #[cfg(feature = "ndi-sdk")]
    if let Ok(mut senders) = registry.senders.lock() {
        senders.remove(&screen_id);
    }

    Ok(true)
}
