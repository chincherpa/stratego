use serde::Deserialize;
use std::sync::Mutex;
use tauri::{Emitter, State, WebviewWindow};

use crate::cursor;
use crate::game::{BoardView, CombatResultDto, GameState, Rank, Side, StatusDto};

pub struct AppState(pub Mutex<GameState>);

impl AppState {
    pub fn new() -> Self {
        AppState(Mutex::new(GameState::new()))
    }
}

#[derive(Deserialize, Clone, Copy, Debug)]
pub struct PosDto {
    pub row: usize,
    pub col: usize,
}

impl From<PosDto> for (usize, usize) {
    fn from(p: PosDto) -> Self {
        (p.row, p.col)
    }
}

const STATE_CHANGED: &str = "state-changed";
const COMBAT_RESOLVED: &str = "combat-resolved";

fn notify(window: &WebviewWindow) {
    let _ = window.emit(STATE_CHANGED, ());
}

#[tauri::command]
pub fn get_status(state: State<AppState>) -> StatusDto {
    state.0.lock().unwrap().status()
}

#[tauri::command]
pub fn get_board_view(state: State<AppState>, side: Side) -> BoardView {
    state.0.lock().unwrap().board_view(side)
}

#[tauri::command]
pub fn place_piece(
    window: WebviewWindow,
    state: State<AppState>,
    side: Side,
    pos: PosDto,
    rank: Rank,
) -> Result<(), String> {
    let result = state
        .0
        .lock()
        .unwrap()
        .place_piece(side, pos.into(), rank)
        .map_err(|e| e.to_string());
    if result.is_ok() {
        notify(&window);
    }
    result
}

#[tauri::command]
pub fn unplace_piece(
    window: WebviewWindow,
    state: State<AppState>,
    side: Side,
    pos: PosDto,
) -> Result<(), String> {
    let result = state
        .0
        .lock()
        .unwrap()
        .unplace_piece(side, pos.into())
        .map_err(|e| e.to_string());
    if result.is_ok() {
        notify(&window);
    }
    result
}

#[tauri::command]
pub fn reposition_piece(
    window: WebviewWindow,
    state: State<AppState>,
    side: Side,
    from: PosDto,
    to: PosDto,
) -> Result<(), String> {
    let result = state
        .0
        .lock()
        .unwrap()
        .reposition_piece(side, from.into(), to.into())
        .map_err(|e| e.to_string());
    if result.is_ok() {
        notify(&window);
    }
    result
}

#[tauri::command]
pub fn random_setup(window: WebviewWindow, state: State<AppState>, side: Side) -> Result<(), String> {
    let result = state
        .0
        .lock()
        .unwrap()
        .random_setup(side)
        .map_err(|e| e.to_string());
    if result.is_ok() {
        notify(&window);
    }
    result
}

#[tauri::command]
pub fn finish_setup(window: WebviewWindow, state: State<AppState>, side: Side) -> Result<(), String> {
    let result = state
        .0
        .lock()
        .unwrap()
        .finish_setup(side)
        .map_err(|e| e.to_string());
    if result.is_ok() {
        notify(&window);
    }
    result
}

#[tauri::command]
pub fn make_move(
    window: WebviewWindow,
    state: State<AppState>,
    side: Side,
    from: PosDto,
    to: PosDto,
) -> Result<(), String> {
    let combat: Option<CombatResultDto> = state
        .0
        .lock()
        .unwrap()
        .make_move(side, from.into(), to.into())
        .map_err(|e| e.to_string())?;
    if let Some(result) = combat {
        let _ = window.emit(COMBAT_RESOLVED, result);
    }
    notify(&window);
    Ok(())
}

/// "Übergeben": applies the queued phase transition and jumps the OS cursor
/// to the centre of the half that now has control.
#[tauri::command]
pub fn confirm_handoff(window: WebviewWindow, state: State<AppState>) -> Result<(), String> {
    let next_side = state
        .0
        .lock()
        .unwrap()
        .confirm_handoff()
        .map_err(|e| e.to_string())?;
    notify(&window);
    cursor::jump_to_side(&window, next_side)
}

/// "Ich überlege noch einmal": rolls back to the snapshot taken right before
/// the pending action; control stays with the side that just acted.
#[tauri::command]
pub fn cancel_handoff(window: WebviewWindow, state: State<AppState>) -> Result<(), String> {
    let result = state
        .0
        .lock()
        .unwrap()
        .cancel_handoff()
        .map(|_| ())
        .map_err(|e| e.to_string());
    if result.is_ok() {
        notify(&window);
    }
    result
}

/// "Neue Partie": full reset to a fresh SetupBlue. No preconditions — works
/// in any phase, including while a handoff popup is pending.
#[tauri::command]
pub fn new_game(window: WebviewWindow, state: State<AppState>) {
    state.0.lock().unwrap().reset();
    notify(&window);
}
