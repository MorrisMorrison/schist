package services_test

import (
	"fmt"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/MorrisMorrison/schist/internal/services"
)

// TestLinkService_ConcurrentBacklinkUpdates exercises the backlinks index from
// many goroutines, as concurrent create/update/backlink requests do. An
// unguarded map here crashes the whole process ("concurrent map writes").
func TestLinkService_ConcurrentBacklinkUpdates(t *testing.T) {
	ds, dir := newSafetyDocumentService(t)
	ls := services.NewLinkService(ds, services.NewIgnoreService(dir))

	mustCreate(t, ds, "/target", "Target", "t")
	const n = 8
	for i := 0; i < n; i++ {
		mustCreate(t, ds, fmt.Sprintf("/src-%d", i), fmt.Sprintf("Src %d", i), "links to [[Target]]")
	}

	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(2)
		go func(i int) {
			defer wg.Done()
			for j := 0; j < 5; j++ {
				assert.NoError(t, ls.UpdateBacklinks(fmt.Sprintf("/src-%d", i)))
			}
		}(i)
		go func() {
			defer wg.Done()
			for j := 0; j < 5; j++ {
				_, err := ls.GetBacklinks("/target")
				assert.NoError(t, err)
			}
		}()
	}
	wg.Wait()

	backlinks, err := ls.GetBacklinks("/target")
	require.NoError(t, err)
	assert.Len(t, backlinks, n)
}
