mod ndi_sender;

use ndi_sender::{ndi_send_rgba_frame, ndi_stop_stream, NdiSenderRegistry};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_shell::init())
        .manage(NdiSenderRegistry::default())
        .invoke_handler(tauri::generate_handler![
            ndi_send_rgba_frame,
            ndi_stop_stream
        ])
        .run(tauri::generate_context!())
        .expect("error while running Studio Grid Director Pro Tauri application");
}
