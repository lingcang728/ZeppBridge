//! Physical-pixel geometry for restoring windows after display changes.

#[derive(Clone, Copy)]
pub(super) struct Rect {
    x: i64,
    y: i64,
    width: i64,
    height: i64,
}

impl Rect {
    pub(super) fn new(x: i32, y: i32, width: u32, height: u32) -> Self {
        Self {
            x: i64::from(x),
            y: i64::from(y),
            width: i64::from(width),
            height: i64::from(height),
        }
    }

    pub(super) fn has_reachable_titlebar(self, work: Self) -> bool {
        if self.width < 64 || self.height < 48 || work.width == 0 || work.height == 0 {
            return false;
        }
        // Requiring some titlebar, rather than any body pixel, lets the user
        // drag the window back. Maximized frames can extend above the work area.
        let overlap_width = (self.x + self.width).min(work.x + work.width) - self.x.max(work.x);
        let overlap_height = (self.y + 32).min(work.y + work.height) - self.y.max(work.y);
        overlap_width >= 64 && overlap_height >= 16
    }

    pub(super) fn centered_origin(self, width: u32, height: u32) -> (i32, i32) {
        // Oversized windows start at the work-area origin to keep the titlebar
        // reachable even when minimum logical size exceeds a high-DPI screen.
        let x = self.x + (self.width - i64::from(width)).max(0) / 2;
        let y = self.y + (self.height - i64::from(height)).max(0) / 2;
        (
            x.clamp(i64::from(i32::MIN), i64::from(i32::MAX)) as i32,
            y.clamp(i64::from(i32::MIN), i64::from(i32::MAX)) as i32,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::Rect;

    const PRIMARY: Rect = Rect {
        x: 0,
        y: 0,
        width: 1920,
        height: 1040,
    };

    #[test]
    fn disconnected_monitor_position_requires_recovery() {
        assert!(!Rect::new(2400, 100, 1280, 800).has_reachable_titlebar(PRIMARY));
    }

    #[test]
    fn negative_monitor_origins_are_valid() {
        let left = Rect::new(-1920, -200, 1920, 1040);
        assert!(Rect::new(-1800, -100, 1280, 800).has_reachable_titlebar(left));
        assert_eq!(left.centered_origin(1280, 800), (-1600, -80));
    }

    #[test]
    fn visible_body_with_inaccessible_titlebar_requires_recovery() {
        assert!(!Rect::new(100, -200, 1280, 800).has_reachable_titlebar(PRIMARY));
        assert!(!Rect::new(1900, 100, 1280, 800).has_reachable_titlebar(PRIMARY));
    }

    #[test]
    fn normal_and_maximized_windows_keep_their_geometry() {
        assert!(Rect::new(100, 100, 1280, 800).has_reachable_titlebar(PRIMARY));
        assert!(Rect::new(-8, -8, 1936, 1056).has_reachable_titlebar(PRIMARY));
    }

    #[test]
    fn empty_and_tiny_windows_require_recovery() {
        assert!(!Rect::new(100, 100, 0, 800).has_reachable_titlebar(PRIMARY));
        assert!(!Rect::new(100, 100, 1280, 0).has_reachable_titlebar(PRIMARY));
        assert!(!Rect::new(100, 100, 10, 10).has_reachable_titlebar(PRIMARY));
    }

    #[test]
    fn oversized_window_keeps_titlebar_at_work_area_origin() {
        let work = Rect::new(200, 40, 800, 600);
        assert_eq!(work.centered_origin(1040, 1120), (200, 40));
        assert_eq!(work.centered_origin(640, 480), (280, 100));
    }

    #[test]
    fn extreme_coordinates_do_not_overflow() {
        let far = Rect::new(i32::MAX, i32::MIN, u32::MAX, u32::MAX);
        assert!(!far.has_reachable_titlebar(PRIMARY));
        assert_eq!(far.centered_origin(1, 1), (i32::MAX, -1));
    }
}
