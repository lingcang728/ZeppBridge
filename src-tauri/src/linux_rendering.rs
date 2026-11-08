//! Target known Linux graphics failures without forcing every GPU onto a fallback.

use std::ffi::OsStr;
use std::path::Path;
use std::process::Command;

const FALLBACK_TRANSITIONS_SCRIPT: &str = "\nwindow.__ZB_DISABLE_VIEW_TRANSITIONS__ = true;\n";

// Follow Clash Verge Rev's NVIDIA / old-Wayland detection, but respect user
// overrides in every branch and compare version numbers rather than strings.
// https://github.com/clash-verge-rev/clash-verge-rev/blob/main/src-tauri/src/utils/linux/workarounds.rs
fn has_nvidia_gpu(root: &Path) -> bool {
    if [
        "proc/driver/nvidia/version",
        "sys/module/nvidia",
        "sys/module/nvidia_drm",
    ]
    .iter()
    .any(|path| root.join(path).exists())
    {
        return true;
    }
    let Ok(cards) = std::fs::read_dir(root.join("sys/class/drm")) else {
        return false;
    };
    cards.flatten().any(|card| {
        let name = card.file_name();
        let name = name.to_string_lossy();
        name.starts_with("card")
            && !name.contains('-')
            && std::fs::read_to_string(card.path().join("device/vendor"))
                .is_ok_and(|vendor| vendor.trim().eq_ignore_ascii_case("0x10de"))
    })
}

fn parse_version(value: &str) -> Option<(u32, u32, u32)> {
    let mut parts = value.trim().split('.');
    let version = (
        parts.next()?.parse().ok()?,
        parts.next()?.parse().ok()?,
        parts.next()?.parse().ok()?,
    );
    parts.next().is_none().then_some(version)
}

fn old_wayland(is_wayland: bool, version: Option<(u32, u32, u32)>) -> bool {
    is_wayland && version.is_some_and(|version| version <= (1, 23, 0))
}

fn wayland_client_version() -> Option<(u32, u32, u32)> {
    // Best effort: pkg-config and development metadata may not be installed on
    // an end user's system. Unknown is not evidence for forcing a fallback.
    let output = Command::new("pkg-config")
        .args(["--modversion", "wayland-client"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    parse_version(std::str::from_utf8(&output.stdout).ok()?)
}

fn automatic_override(current: Option<&OsStr>, affected: bool) -> Option<&'static str> {
    (current.is_none() && affected).then_some("1")
}

fn disabled(value: Option<&OsStr>) -> bool {
    value.is_some_and(|value| value != "0")
}

fn is_wayland_backend(gdk_backend: Option<&str>, session_type: Option<&str>) -> bool {
    // An explicit X11 backend still needs the NVIDIA fallback inside a Wayland
    // desktop. GTK accepts an ordered comma-separated list of backends.
    if let Some(backends) = gdk_backend {
        for backend in backends.split(',').map(str::trim) {
            match backend {
                "wayland" => return true,
                "x11" => return false,
                _ => {}
            }
        }
        // Unknown/unsupported backend choices are not evidence for an exception.
        return false;
    }
    session_type == Some("wayland")
}

fn native_niri(is_wayland: bool, desktop: Option<&str>, niri_socket: Option<&OsStr>) -> bool {
    is_wayland
        && (desktop.is_some_and(|value| {
            value
                .split(':')
                .any(|part| part.trim().eq_ignore_ascii_case("niri"))
        }) || niri_socket.is_some_and(|value| !value.is_empty()))
}

pub fn configure() -> &'static str {
    let current_dmabuf = std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER");
    let mut reason = "WebKit default or user override";
    if current_dmabuf.is_none() {
        let nvidia = has_nvidia_gpu(Path::new("/"));
        let is_wayland = is_wayland_backend(
            std::env::var("GDK_BACKEND").ok().as_deref(),
            std::env::var("XDG_SESSION_TYPE").ok().as_deref(),
        );
        // On NVIDIA + niri, disabling DMABUF drops the accelerated backing
        // store on modern WebKitGTK and makes scrolling visibly sluggish.
        // Keep the working native path; retain the fallback for other desktops.
        // https://github.com/tw93/Pake/issues/1226
        let nvidia_fallback = nvidia
            && !native_niri(
                is_wayland,
                std::env::var("XDG_CURRENT_DESKTOP").ok().as_deref(),
                std::env::var_os("NIRI_SOCKET").as_deref(),
            );
        let older_wayland =
            !nvidia_fallback && is_wayland && old_wayland(true, wayland_client_version());
        if nvidia && !nvidia_fallback {
            reason = "NVIDIA / niri native Wayland";
        }
        if let Some(value) =
            automatic_override(current_dmabuf.as_deref(), nvidia_fallback || older_wayland)
        {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", value);
            reason = if nvidia_fallback {
                "NVIDIA"
            } else {
                "Wayland client <= 1.23.0"
            };
        }
    }

    // Keep the existing AppImage workaround for bundled graphics-stack issues
    // (#32). This is independent of the DMABUF policy and WebKit version.
    let current_compositing = std::env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE");
    if let Some(value) = automatic_override(
        current_compositing.as_deref(),
        std::env::var_os("APPIMAGE").is_some(),
    ) {
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", value);
    }
    let dmabuf = std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER");
    let compositing = std::env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE");
    // Disabling DMABUF selects another buffer-presentation path; it is not a
    // universal GPU-off switch. Conservatively skip snapshot transitions in
    // either fallback: WebKitGTK 2.54.1/Wayland aborts in graphicsLayerFactory()
    // when a View Transition captures a page with DMABUF disabled.
    // https://github.com/WebKit/WebKit/blob/webkitgtk-2.54.1/Source/WebKit/WebProcess/WebPage/CoordinatedGraphics/FrameRenderer.h
    let skip_transitions = disabled(dmabuf.as_deref()) || disabled(compositing.as_deref());
    super::diagnostics::log(&format!(
        "Linux rendering: policy={reason}, disable_dmabuf={dmabuf:?}, disable_compositing={compositing:?}, skip_view_transitions={skip_transitions}"
    ));
    if skip_transitions {
        FALLBACK_TRANSITIONS_SCRIPT
    } else {
        ""
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    struct HardwareFixture(PathBuf);

    impl HardwareFixture {
        fn new() -> Self {
            let unique = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            Self(std::env::temp_dir().join(format!(
                "zeppbridge-linux-gpu-{}-{unique}",
                std::process::id()
            )))
        }

        fn write(&self, path: &str, content: &str) {
            let path = self.0.join(path);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(path, content).unwrap();
        }
    }

    impl Drop for HardwareFixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn finds_nvidia_in_a_hybrid_gpu_system_without_loaded_driver_markers() {
        let root = HardwareFixture::new();
        root.write("sys/class/drm/card0/device/vendor", "0x1002\n");
        root.write("sys/class/drm/card1/device/vendor", "0x10DE\n");
        assert!(has_nvidia_gpu(&root.0));
    }

    #[test]
    fn detects_each_nvidia_driver_marker() {
        for marker in [
            "proc/driver/nvidia/version",
            "sys/module/nvidia",
            "sys/module/nvidia_drm",
        ] {
            let root = HardwareFixture::new();
            root.write(marker, "");
            assert!(has_nvidia_gpu(&root.0), "missing marker {marker}");
        }
    }

    #[test]
    fn missing_or_non_nvidia_devices_do_not_force_a_workaround() {
        let root = HardwareFixture::new();
        assert!(!has_nvidia_gpu(&root.0));
        root.write("sys/class/drm/card0/device/vendor", "0x1002\n");
        root.write("sys/class/drm/card1/device/vendor", "0x8086\n");
        root.write("sys/class/drm/card0-DP-1/device/vendor", "0x10de\n");
        assert!(!has_nvidia_gpu(&root.0));
    }

    #[test]
    fn wayland_versions_are_numeric_and_unknown_versions_do_not_force_fallback() {
        assert!(old_wayland(true, parse_version("1.9.0\n")));
        assert!(old_wayland(true, parse_version("1.23.0")));
        assert!(!old_wayland(true, parse_version("1.23.1")));
        assert!(!old_wayland(true, parse_version("1.26.0")));
        assert!(!old_wayland(false, parse_version("1.23.0")));
        for value in ["", "unknown", "1.23", "1.23.0.1", "1.23.0-devel"] {
            assert_eq!(parse_version(value), None);
            assert!(!old_wayland(true, parse_version(value)));
        }
    }

    #[test]
    fn explicit_overrides_win_over_all_automatic_workarounds() {
        for affected in [false, true] {
            for value in ["0", "1", ""] {
                assert_eq!(automatic_override(Some(OsStr::new(value)), affected), None);
            }
        }
        assert_eq!(automatic_override(None, true), Some("1"));
        assert_eq!(automatic_override(None, false), None);
    }

    #[test]
    fn fallback_override_skips_transitions_but_zero_does_not() {
        assert!(!disabled(None));
        assert!(!disabled(Some(OsStr::new("0"))));
        assert!(disabled(Some(OsStr::new("1"))));
    }

    #[test]
    fn niri_exception_requires_native_wayland_and_a_positive_compositor_match() {
        for desktop in ["niri", "Niri", "custom:niri"] {
            assert!(native_niri(true, Some(desktop), None));
            assert!(!native_niri(false, Some(desktop), None));
        }
        assert!(native_niri(
            true,
            None,
            Some(OsStr::new("/run/user/1000/niri.sock"))
        ));
        assert!(!native_niri(
            false,
            None,
            Some(OsStr::new("/run/user/1000/niri.sock"))
        ));
        for desktop in [
            None,
            Some(""),
            Some("GNOME"),
            Some("KDE"),
            Some("Hyprland"),
            Some("not-niri"),
        ] {
            assert!(!native_niri(true, desktop, None));
            assert!(!native_niri(true, desktop, Some(OsStr::new(""))));
        }
    }

    #[test]
    fn explicit_gdk_backend_takes_precedence_over_the_desktop_session() {
        assert!(is_wayland_backend(None, Some("wayland")));
        assert!(is_wayland_backend(Some("wayland"), Some("x11")));
        assert!(is_wayland_backend(Some("wayland,x11"), Some("wayland")));
        for backend in ["x11", "x11,wayland", "broadway", ""] {
            assert!(!is_wayland_backend(Some(backend), Some("wayland")));
        }
        assert!(!is_wayland_backend(None, Some("x11")));
        assert!(!is_wayland_backend(None, None));
    }
}
