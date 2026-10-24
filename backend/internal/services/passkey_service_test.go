package services_test

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"testing"

	"github.com/MorrisMorrison/schist/internal/config"
	"github.com/MorrisMorrison/schist/internal/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newTestPasskeyService(t *testing.T, credentialIDs ...string) (*services.PasskeyService, string) {
	t.Helper()
	dataDir := t.TempDir()

	storage := services.PasskeyStorage{Version: 1}
	for _, id := range credentialIDs {
		storage.Credentials = append(storage.Credentials, services.PasskeyCredential{
			ID:      id,
			Name:    "key " + id,
			KeySeed: []byte("0123456789abcdef0123456789abcdef"),
		})
	}
	data, err := json.Marshal(storage)
	require.NoError(t, err)
	require.NoError(t, os.MkdirAll(filepath.Join(dataDir, ".schist"), 0755))
	require.NoError(t, os.WriteFile(filepath.Join(dataDir, ".schist", "passkeys.json"), data, 0600))

	ps, err := services.NewPasskeyService(&config.Config{
		DataDir:     dataDir,
		FrontendURL: "http://localhost:5173",
	})
	require.NoError(t, err)
	return ps, dataDir
}

// TestPasskeyService_ConcurrentDeleteCredential verifies that the
// read-modify-write on passkeys.json is serialized: concurrent deletes of
// distinct credentials must all take effect.
func TestPasskeyService_ConcurrentDeleteCredential(t *testing.T) {
	const n = 20
	ids := make([]string, n)
	for i := range ids {
		ids[i] = fmt.Sprintf("cred-%d", i)
	}
	ps, _ := newTestPasskeyService(t, ids...)

	var wg sync.WaitGroup
	for _, id := range ids {
		wg.Add(1)
		go func(id string) {
			defer wg.Done()
			assert.NoError(t, ps.DeleteCredential(id))
		}(id)
	}
	wg.Wait()

	remaining, err := ps.ListCredentials()
	require.NoError(t, err)
	assert.Empty(t, remaining, "every concurrently deleted credential must be gone")
}

func TestPasskeyService_DeleteCredential(t *testing.T) {
	tests := []struct {
		name      string
		deleteID  string
		wantErr   bool
		remaining int
	}{
		{name: "deletes existing credential", deleteID: "a", remaining: 1},
		{name: "unknown credential is not found", deleteID: "missing", wantErr: true, remaining: 2},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ps, _ := newTestPasskeyService(t, "a", "b")

			err := ps.DeleteCredential(tt.deleteID)
			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}

			creds, err := ps.ListCredentials()
			require.NoError(t, err)
			assert.Len(t, creds, tt.remaining)
		})
	}
}
