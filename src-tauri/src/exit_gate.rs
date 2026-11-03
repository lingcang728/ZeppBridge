//! An exit waiter must not turn a second quit request into permission to exit.
use std::sync::atomic::{AtomicU8, Ordering};

const RUNNING: u8 = 0;
const WAITING: u8 = 1;
const READY: u8 = 2;

#[derive(Default)]
pub(crate) struct ExitGate(AtomicU8);

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum ExitAction {
    CheckWriters,
    KeepWaiting,
    Allow,
}

impl ExitGate {
    pub(crate) const fn new() -> Self {
        Self(AtomicU8::new(RUNNING))
    }

    pub(crate) fn request(&self) -> ExitAction {
        match self
            .0
            .compare_exchange(RUNNING, WAITING, Ordering::AcqRel, Ordering::Acquire)
        {
            Ok(_) => ExitAction::CheckWriters,
            Err(READY) => ExitAction::Allow,
            Err(_) => ExitAction::KeepWaiting,
        }
    }

    pub(crate) fn is_exiting(&self) -> bool {
        self.0.load(Ordering::Acquire) != RUNNING
    }

    pub(crate) fn writers_finished(&self) {
        self.0.store(READY, Ordering::Release);
    }

    pub(crate) fn retry_later(&self) {
        self.0.store(RUNNING, Ordering::Release);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repeated_quit_does_not_bypass_a_writer() {
        let gate = ExitGate::new();
        assert_eq!(gate.request(), ExitAction::CheckWriters);
        assert!(gate.is_exiting());
        assert_eq!(gate.request(), ExitAction::KeepWaiting);
        assert_eq!(gate.request(), ExitAction::KeepWaiting);
        gate.writers_finished();
        assert_eq!(gate.request(), ExitAction::Allow);
    }

    #[test]
    fn failed_wait_allows_a_fresh_quit_attempt() {
        let gate = ExitGate::default();
        assert_eq!(gate.request(), ExitAction::CheckWriters);
        gate.retry_later();
        assert!(!gate.is_exiting());
        assert_eq!(gate.request(), ExitAction::CheckWriters);
        assert_eq!(gate.request(), ExitAction::KeepWaiting);
    }

    #[test]
    fn simultaneous_requests_create_only_one_waiter() {
        let gate = std::sync::Arc::new(ExitGate::default());
        let workers: Vec<_> = (0..16)
            .map(|_| {
                let gate = gate.clone();
                std::thread::spawn(move || gate.request())
            })
            .collect();
        let actions: Vec<_> = workers.into_iter().map(|w| w.join().unwrap()).collect();
        assert_eq!(
            actions
                .iter()
                .filter(|a| **a == ExitAction::CheckWriters)
                .count(),
            1
        );
        assert_eq!(
            actions
                .iter()
                .filter(|a| **a == ExitAction::KeepWaiting)
                .count(),
            15
        );
    }
}
