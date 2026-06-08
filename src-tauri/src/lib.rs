mod commands;
mod cursor;
mod game;

use commands::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::new())
        .setup(|app| {
            // The dashed divider between the two panels must land exactly on
            // the physical screen centre, where the player tapes the
            // cardboard sight-blocker. Plain `maximize()` leaves the taskbar
            // and DWM borders in the picture (and was a no-op on Windows when
            // called this early), so we go borderless-fullscreen instead —
            // that guarantees the window's own centre is the screen's centre,
            // matching the cursor-jump math in `cursor::jump_to_side`.
            for (label, window) in app.webview_windows() {
                match window.set_fullscreen(true) {
                    Ok(()) => eprintln!("[setup] fullscreened window '{label}'"),
                    Err(e) => eprintln!("[setup] failed to fullscreen window '{label}': {e}"),
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_status,
            commands::get_board_view,
            commands::place_piece,
            commands::unplace_piece,
            commands::reposition_piece,
            commands::random_setup,
            commands::finish_setup,
            commands::make_move,
            commands::confirm_handoff,
            commands::cancel_handoff,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
