package services

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type schedulerProbe struct {
	calls      atomic.Int32
	onSave     atomic.Bool
	auto       atomic.Bool
	release    chan struct{} // when set, each sync blocks until it is closed
	err        error
	mu         sync.Mutex
	syncedTime []time.Time
}

func newTestScheduler(t *testing.T, p *schedulerProbe, debounce, maxWait, interval time.Duration) *syncScheduler {
	t.Helper()
	s := newSyncScheduler(syncSchedulerConfig{
		sync: func() error {
			p.calls.Add(1)
			p.mu.Lock()
			p.syncedTime = append(p.syncedTime, time.Now())
			p.mu.Unlock()
			if p.release != nil {
				<-p.release
			}
			return p.err
		},
		syncOnSave: p.onSave.Load,
		autoSync:   p.auto.Load,
		debounce:   func() time.Duration { return debounce },
		maxWait:    maxWait,
		interval:   interval,
	})
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		s.Stop(ctx)
	})
	return s
}

func TestSyncScheduler_BurstOfSavesMakesOneSync(t *testing.T) {
	p := &schedulerProbe{}
	p.onSave.Store(true)
	s := newTestScheduler(t, p, 40*time.Millisecond, time.Second, time.Hour)

	for range 5 {
		s.Notify()
		time.Sleep(5 * time.Millisecond)
	}
	assert.Zero(t, p.calls.Load(), "nothing runs during the debounce")
	require.Eventually(t, func() bool { return p.calls.Load() == 1 }, time.Second, 5*time.Millisecond)
	time.Sleep(100 * time.Millisecond)
	assert.Equal(t, int32(1), p.calls.Load(), "one sync for the burst")
}

func TestSyncScheduler_NotifyNeverBlocksOrFails(t *testing.T) {
	p := &schedulerProbe{err: errors.New("push rejected"), release: make(chan struct{})}
	p.onSave.Store(true)
	s := newTestScheduler(t, p, 0, 0, time.Hour)

	s.Notify()
	require.Eventually(t, func() bool { return p.calls.Load() == 1 }, time.Second, time.Millisecond)

	// A sync is running (blocked): more saves return at once.
	start := time.Now()
	for range 3 {
		s.Notify()
	}
	assert.Less(t, time.Since(start), 50*time.Millisecond)
	close(p.release)

	// Saves made during the sync are pushed by one more sync, and the failing
	// sync doesn't stop later ones.
	require.Eventually(t, func() bool { return p.calls.Load() == 2 }, time.Second, time.Millisecond)
	time.Sleep(50 * time.Millisecond)
	assert.Equal(t, int32(2), p.calls.Load())
}

func TestSyncScheduler_MaxWaitCapsTheDebounce(t *testing.T) {
	p := &schedulerProbe{}
	p.onSave.Store(true)
	s := newTestScheduler(t, p, 60*time.Millisecond, 150*time.Millisecond, time.Hour)

	start := time.Now()
	deadline := start.Add(400 * time.Millisecond)
	for time.Now().Before(deadline) && p.calls.Load() == 0 {
		s.Notify() // keeps resetting the debounce
		time.Sleep(10 * time.Millisecond)
	}
	require.Equal(t, int32(1), p.calls.Load(), "steady saves must still sync")
	p.mu.Lock()
	elapsed := p.syncedTime[0].Sub(start)
	p.mu.Unlock()
	assert.Less(t, elapsed, 300*time.Millisecond)
}

func TestSyncScheduler_NothingRunsWhenOff(t *testing.T) {
	p := &schedulerProbe{} // sync on save and auto sync off, e.g. GitHub not set up
	s := newTestScheduler(t, p, 0, 0, 10*time.Millisecond)
	s.Start(context.Background())

	for range 3 {
		s.Notify()
	}
	time.Sleep(80 * time.Millisecond)
	assert.Zero(t, p.calls.Load())
}

func TestSyncScheduler_AutoSyncRunsOnTheInterval(t *testing.T) {
	p := &schedulerProbe{}
	p.auto.Store(true)
	s := newTestScheduler(t, p, time.Hour, time.Hour, 20*time.Millisecond)
	s.Start(context.Background())

	require.Eventually(t, func() bool { return p.calls.Load() >= 2 }, time.Second, 5*time.Millisecond)

	p.auto.Store(false)
	time.Sleep(30 * time.Millisecond) // let a tick already in flight finish
	n := p.calls.Load()
	time.Sleep(80 * time.Millisecond)
	assert.Equal(t, n, p.calls.Load(), "turning auto sync off stops it")
}

func TestSyncScheduler_StopCancelsPendingSync(t *testing.T) {
	p := &schedulerProbe{}
	p.onSave.Store(true)
	s := newTestScheduler(t, p, 30*time.Millisecond, time.Second, time.Hour)

	s.Notify()
	s.Stop(context.Background())
	time.Sleep(80 * time.Millisecond)
	assert.Zero(t, p.calls.Load())
	s.Notify()
	time.Sleep(50 * time.Millisecond)
	assert.Zero(t, p.calls.Load(), "a stopped scheduler ignores commits")
}
