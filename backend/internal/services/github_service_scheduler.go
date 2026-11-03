package services

import (
	"context"
	"log"
	"sync"
	"time"
)

const (
	// syncOnSaveDebounce is how long sync on save waits after the last
	// commit, so a burst of saves (an import, a few quick edits) makes one push.
	syncOnSaveDebounce = 30 * time.Second
	// syncOnSaveMaxWait caps the wait while saves keep coming, so steady
	// editing still gets backed up.
	syncOnSaveMaxWait = 5 * time.Minute
)

type syncSchedulerConfig struct {
	// sync runs one sync; its error is only logged (the sync records it).
	sync func() error
	// syncOnSave and autoSync report whether each mode is on right now.
	syncOnSave func() bool
	autoSync   func() bool

	debounce time.Duration
	maxWait  time.Duration
	interval time.Duration
}

// syncScheduler runs GitHub syncs in the background: debounced after commits
// (sync on save) and on an interval (auto sync). It never blocks or fails
// the caller, and runs at most one sync at a time; a request that arrives
// while one is running runs once more afterwards, so its commit is pushed.
type syncScheduler struct {
	cfg syncSchedulerConfig

	mu           sync.Mutex
	timer        *time.Timer
	firstPending time.Time // first Notify not yet synced; zero when idle
	running      bool
	rerun        bool
	stopped      bool
	cancel       context.CancelFunc
	done         sync.WaitGroup // the running sync and the interval loop
}

func newSyncScheduler(cfg syncSchedulerConfig) *syncScheduler {
	return &syncScheduler{cfg: cfg}
}

// Notify reports a commit. When sync on save is on, it (re)starts the
// debounce timer, firing no later than maxWait after the first unsynced
// commit.
func (s *syncScheduler) Notify() {
	if !s.cfg.syncOnSave() {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.stopped {
		return
	}

	now := time.Now()
	if s.firstPending.IsZero() {
		s.firstPending = now
	}
	delay := s.cfg.debounce
	if deadline := s.firstPending.Add(s.cfg.maxWait); now.Add(delay).After(deadline) {
		delay = max(deadline.Sub(now), 0)
	}
	if s.timer != nil {
		s.timer.Stop()
	}
	s.timer = time.AfterFunc(delay, s.fireDebounced)
}

func (s *syncScheduler) fireDebounced() {
	s.mu.Lock()
	s.timer = nil
	s.firstPending = time.Time{}
	s.mu.Unlock()
	s.trigger()
}

// trigger starts a sync unless one is running, in which case that one runs
// again when it finishes.
func (s *syncScheduler) trigger() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.stopped {
		return
	}
	if s.running {
		s.rerun = true
		return
	}
	s.running = true
	s.done.Add(1)
	go s.runSyncs()
}

func (s *syncScheduler) runSyncs() {
	defer s.done.Done()
	for {
		if err := s.cfg.sync(); err != nil {
			log.Printf("[GitHubSync] Background sync failed: %v", err)
		}
		s.mu.Lock()
		if !s.rerun || s.stopped {
			s.running = false
			s.rerun = false
			s.mu.Unlock()
			return
		}
		s.rerun = false
		s.mu.Unlock()
	}
}

// Start runs the auto-sync loop until ctx is done or Stop is called.
func (s *syncScheduler) Start(ctx context.Context) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.stopped || s.cancel != nil {
		return
	}
	ctx, s.cancel = context.WithCancel(ctx)
	s.done.Add(1)
	go func() {
		defer s.done.Done()
		ticker := time.NewTicker(s.cfg.interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if s.cfg.autoSync() {
					s.trigger()
				}
			}
		}
	}()
}

// Stop cancels the pending debounce and the loop, then waits until ctx is
// done for a running sync to finish.
func (s *syncScheduler) Stop(ctx context.Context) {
	s.mu.Lock()
	s.stopped = true
	if s.timer != nil {
		s.timer.Stop()
		s.timer = nil
	}
	if s.cancel != nil {
		s.cancel()
	}
	s.mu.Unlock()

	finished := make(chan struct{})
	go func() {
		s.done.Wait()
		close(finished)
	}()
	select {
	case <-finished:
	case <-ctx.Done():
		log.Printf("[GitHubSync] Stopped without waiting for a running sync")
	}
}
