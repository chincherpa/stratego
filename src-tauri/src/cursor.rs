use enigo::{Coordinate, Enigo, Mouse, Settings};
use tauri::WebviewWindow;

use crate::game::Side;

/// Jumps the OS mouse cursor to the centre of the half of the window that now
/// has control, so the next player can start interacting immediately without
/// reaching across the cardboard divider.
///
/// Left half = Blue (x ≈ 25% of window width), right half = Red (x ≈ 75%),
/// vertically centred. The window is expected to run maximized/borderless so
/// the panel split lines up with the screen's physical centre.
pub fn jump_to_side(window: &WebviewWindow, side: Side) -> Result<(), String> {
    let position = window.outer_position().map_err(|e| e.to_string())?;
    let size = window.outer_size().map_err(|e| e.to_string())?;

    let x_fraction = match side {
        Side::Blue => 0.25,
        Side::Red => 0.75,
    };

    let target_x = position.x + (size.width as f64 * x_fraction) as i32;
    let target_y = position.y + (size.height as f64 * 0.5) as i32;

    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    enigo
        .move_mouse(target_x, target_y, Coordinate::Abs)
        .map_err(|e| e.to_string())
}
