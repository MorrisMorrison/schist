package services_test

import (
	"testing"

	"github.com/MorrisMorrison/schist/internal/services"
)

// setupDocumentService returns a git-backed document service on dataDir.
func setupDocumentService(t *testing.T, dataDir string) *services.DocumentService {
	t.Helper()
	gitService, err := services.NewGitService(dataDir)
	if err != nil {
		t.Skipf("Skipping test, git service not available: %v", err)
	}
	return services.NewDocumentService(dataDir, gitService, services.NewIgnoreService(dataDir))
}
