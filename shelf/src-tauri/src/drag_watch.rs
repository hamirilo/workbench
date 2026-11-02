//! Showing the shelf while files are being dragged around the system.
//!
//! Two triggers bring the shelf up mid-drag:
//! - everywhere: a drag touching the thin strip window at the screen edge
//!   (see `edge.html`), which calls [`drag_reached_edge`];
//! - macOS only: any file drag starting in another app (Finder, …),
//!   detected by watching the system drag pasteboard, and any drag out of
//!   the Dock (see [`macos::install`]).
//!
//! Either way the shelf is shown without taking focus, and if it was hidden
//! before and the drag ends without anything being dropped on it, it is
//! hidden again. Windows has no way to observe other apps starting a drag, so it
//! relies on the edge strip alone.

use std::{
    sync::atomic::{AtomicBool, Ordering},
    thread,
    time::Duration,
};

use tauri::{AppHandle, Manager};

/// Set while a drag that brought up the shelf is still in progress.
static TRACKING: AtomicBool = AtomicBool::new(false);
/// Set when files land on the shelf during that drag.
static DROPPED: AtomicBool = AtomicBool::new(false);

/// Records that files were added to the shelf, so a shelf that was brought
/// up by the current drag stays open afterwards.
pub fn note_drop() {
    DROPPED.store(true, Ordering::SeqCst);
}

/// Called when a drag enters the edge strip.
pub fn drag_reached_edge(app: &AppHandle) {
    on_drag_started(app);
}

fn on_drag_started(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let was_visible = window.is_visible().unwrap_or(false);
    if !was_visible {
        let _ = window.show();
    }
    // One watcher per drag; later triggers during the same drag are no-ops.
    if TRACKING.swap(true, Ordering::SeqCst) {
        return;
    }
    DROPPED.store(false, Ordering::SeqCst);
    let app = app.clone();
    thread::spawn(move || {
        while primary_button_down() {
            thread::sleep(Duration::from_millis(50));
        }
        // Give the drop event time to reach the shelf before deciding.
        thread::sleep(Duration::from_millis(600));
        TRACKING.store(false, Ordering::SeqCst);
        if !was_visible && !DROPPED.load(Ordering::SeqCst) {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.hide();
            }
        }
    });
}

/// Whether the button that drags things (left, or right when swapped) is held.
#[cfg(target_os = "macos")]
fn primary_button_down() -> bool {
    // Bit 0 is the primary button; macOS already accounts for swapped buttons.
    objc2_app_kit::NSEvent::pressedMouseButtons() & 1 != 0
}

#[cfg(windows)]
fn primary_button_down() -> bool {
    use windows_sys::Win32::UI::{
        Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON, VK_RBUTTON},
        WindowsAndMessaging::{GetSystemMetrics, SM_SWAPBUTTON},
    };
    // GetAsyncKeyState reports physical buttons, so honour a swapped mouse.
    let key = if unsafe { GetSystemMetrics(SM_SWAPBUTTON) } != 0 { VK_RBUTTON } else { VK_LBUTTON };
    (unsafe { GetAsyncKeyState(key as i32) } as u16 & 0x8000) != 0
}

#[cfg(not(any(target_os = "macos", windows)))]
fn primary_button_down() -> bool {
    false
}

#[cfg(target_os = "macos")]
pub mod macos {
    use std::{thread, time::Duration};

    use std::ffi::c_void;

    use core_foundation_sys::{
        array::{CFArrayGetCount, CFArrayGetValueAtIndex, CFArrayRef},
        base::{CFRelease, CFTypeRef},
        dictionary::{CFDictionaryGetValue, CFDictionaryRef},
        number::{kCFNumberSInt32Type, CFNumberGetValue, CFNumberRef},
        string::CFStringRef,
    };
    use objc2::rc::autoreleasepool;
    use objc2_app_kit::{NSPasteboard, NSPasteboardNameDrag, NSRunningApplication};
    use objc2_foundation::ns_string;
    use tauri::AppHandle;

    #[repr(C)]
    #[derive(Clone, Copy, Default)]
    struct CGPoint {
        x: f64,
        y: f64,
    }

    #[repr(C)]
    #[derive(Clone, Copy, Default)]
    struct CGRect {
        origin: CGPoint,
        size: CGPoint,
    }

    impl CGRect {
        fn contains(&self, p: CGPoint) -> bool {
            p.x >= self.origin.x
                && p.y >= self.origin.y
                && p.x < self.origin.x + self.size.x
                && p.y < self.origin.y + self.size.y
        }
    }

    const ON_SCREEN_ONLY: u32 = 1 << 0;
    const EXCLUDE_DESKTOP_ELEMENTS: u32 = 1 << 4;

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        static kCGWindowOwnerPID: CFStringRef;
        static kCGWindowLayer: CFStringRef;
        static kCGWindowBounds: CFStringRef;
        fn CGWindowListCopyWindowInfo(option: u32, relative_to: u32) -> CFArrayRef;
        fn CGRectMakeWithDictionaryRepresentation(dict: CFDictionaryRef, rect: *mut CGRect) -> bool;
        fn CGEventCreate(source: *const c_void) -> CFTypeRef;
        fn CGEventGetLocation(event: CFTypeRef) -> CGPoint;
    }

    /// The pointer, in the same top-left-origin points as window bounds.
    fn cursor() -> CGPoint {
        unsafe {
            let event = CGEventCreate(std::ptr::null());
            if event.is_null() {
                return CGPoint::default();
            }
            let at = CGEventGetLocation(event);
            CFRelease(event);
            at
        }
    }

    /// Whether the frontmost window under `at` belongs to the Dock. Overlays
    /// above it (other system windows) are looked through; an ordinary app
    /// window (layer 0 or below) ends the search.
    fn on_dock_window(at: CGPoint) -> bool {
        let docks = NSRunningApplication::runningApplicationsWithBundleIdentifier(ns_string!("com.apple.dock"));
        let Some(dock_pid) = docks.iter().next().map(|app| app.processIdentifier()) else {
            return false;
        };
        unsafe {
            let windows = CGWindowListCopyWindowInfo(ON_SCREEN_ONLY | EXCLUDE_DESKTOP_ELEMENTS, 0);
            if windows.is_null() {
                return false;
            }
            let mut found = false;
            for i in 0..CFArrayGetCount(windows) {
                let info = CFArrayGetValueAtIndex(windows, i) as CFDictionaryRef;
                let mut bounds = CGRect::default();
                let bounds_dict = CFDictionaryGetValue(info, kCGWindowBounds as *const c_void) as CFDictionaryRef;
                if bounds_dict.is_null()
                    || !CGRectMakeWithDictionaryRepresentation(bounds_dict, &mut bounds)
                    || !bounds.contains(at)
                {
                    continue;
                }
                if number(info, kCGWindowOwnerPID) == Some(dock_pid) {
                    found = true;
                    break;
                }
                if number(info, kCGWindowLayer).unwrap_or(0) <= 0 {
                    break;
                }
            }
            CFRelease(windows as CFTypeRef);
            found
        }
    }

    unsafe fn number(info: CFDictionaryRef, key: CFStringRef) -> Option<i32> {
        let value = CFDictionaryGetValue(info, key as *const c_void) as CFNumberRef;
        let mut out = 0i32;
        (!value.is_null() && CFNumberGetValue(value, kCFNumberSInt32Type, (&mut out as *mut i32).cast())).then_some(out)
    }

    /// How often the mouse button is checked.
    const POLL: Duration = Duration::from_millis(100);
    /// How far (points) a press on the Dock moves before it is a drag.
    const DOCK_DRAG_DISTANCE: f64 = 8.0;

    /// Watches for file drags starting in other apps and shows the shelf as
    /// soon as one does.
    ///
    /// Every new drag session writes to the shared drag pasteboard, so a
    /// change in its `changeCount` while the mouse button is held marks a
    /// drag start. Only the pasteboard's types are inspected, never its
    /// contents.
    ///
    /// Drags out of the Dock (a stack's fan or grid) never touch the drag
    /// pasteboard, so a press that starts on a Dock window and then moves
    /// counts as a drag start too. That also catches rearranging the Dock's
    /// icons; the shelf then hides again as nothing lands on it.
    ///
    /// This polls rather than listening for other apps' mouse-dragged
    /// events, which did not catch every drag. Shelf's own drags are seen
    /// too, but the shelf is already showing then, so they change nothing.
    pub fn install(app: AppHandle) {
        thread::spawn(move || {
            let drag_pasteboard = NSPasteboard::pasteboardWithName(unsafe { NSPasteboardNameDrag });
            let mut last_change = drag_pasteboard.changeCount();
            let mut was_down = false;
            // Where a press on a Dock window started, until it moves far
            // enough to be a drag.
            let mut dock_press: Option<CGPoint> = None;
            loop {
                thread::sleep(POLL);
                // This thread has no run loop to drain autoreleased objects.
                autoreleasepool(|_| {
                    let down = super::primary_button_down();
                    if down {
                        let change = drag_pasteboard.changeCount();
                        if change != last_change {
                            last_change = change;
                            if has_files(&drag_pasteboard) {
                                dock_press = None;
                                super::on_drag_started(&app);
                            }
                        }
                        if !was_down {
                            let at = cursor();
                            dock_press = on_dock_window(at).then_some(at);
                        } else if let Some(start) = dock_press {
                            let at = cursor();
                            if (at.x - start.x).hypot(at.y - start.y) >= DOCK_DRAG_DISTANCE {
                                dock_press = None;
                                super::on_drag_started(&app);
                            }
                        }
                    } else if was_down {
                        dock_press = None;
                        // A drag too quick to catch while the button was held
                        // must not count as one at the next click.
                        last_change = drag_pasteboard.changeCount();
                    }
                    was_down = down;
                });
            }
        });
    }

    fn has_files(pasteboard: &NSPasteboard) -> bool {
        pasteboard.types().is_some_and(|types| {
            types.iter().any(|t| {
                // Some sources, such as the Dock, may only declare the
                // legacy file-name list.
                let t = t.to_string();
                t == "public.file-url" || t == "NSFilenamesPboardType"
            })
        })
    }
}
