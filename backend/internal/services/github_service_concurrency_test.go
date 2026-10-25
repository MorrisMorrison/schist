package services

import (
	"sync"
	"testing"
	"time"

	"github.com/google/go-github/v57/github"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// requireClient builds the shared client and fails the test if it can't.
func requireClient(t *testing.T, gs *GitHubService) *github.Client {
	t.Helper()
	client, err := gs.ensureClient()
	require.NoError(t, err)
	return client
}

// Status checks, config updates and client rebuilds (setup, disconnect) run in
// parallel requests. Run with -race: any unguarded access to the client fails.
func TestGitHubService_ConcurrentClientAccess(t *testing.T) {
	f := newGitHubFixture(t, enabledSettings())

	const workers = 8
	const iterations = 25

	done := make(chan struct{})
	go func() {
		defer close(done)
		var wg sync.WaitGroup
		for w := range workers {
			wg.Add(1)
			go func(w int) {
				defer wg.Done()
				for i := range iterations {
					switch (w + i) % 4 {
					case 0:
						_, _ = f.gs.GetGitHubConnectionStatus()
					case 1:
						autoSync := i%2 == 0
						_ = f.gs.UpdateConfiguration(&GitHubConfigRequest{AutoSync: &autoSync})
					case 2:
						_, _ = f.gs.ensureClient()
					case 3:
						f.gs.setClient(nil)
					}
				}
			}(w)
		}
		wg.Wait()
	}()
	select {
	case <-done:
	case <-time.After(60 * time.Second):
		t.Fatal("timed out: possible deadlock")
	}

	// Concurrent first uses share a single client.
	f.gs.setClient(nil)
	clients := make([]*github.Client, workers)
	var wg sync.WaitGroup
	for w := range workers {
		wg.Add(1)
		go func(w int) {
			defer wg.Done()
			clients[w], _ = f.gs.ensureClient()
		}(w)
	}
	wg.Wait()
	for _, c := range clients {
		require.NotNil(t, c)
		assert.Same(t, clients[0], c)
	}
}
