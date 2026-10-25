package utils

import (
	"fmt"
	"os"
	"path/filepath"
)

// WriteFileAtomic writes data to path so that readers (and a crash) only ever
// observe either the old file or the complete new one, never a truncated or
// half-written file. It writes to a temp file in the same directory, syncs it,
// sets perm, and renames it over path. Rename is atomic on the same filesystem.
// The parent directory must already exist.
func WriteFileAtomic(path string, data []byte, perm os.FileMode) error {
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, "."+filepath.Base(path)+".*.tmp")
	if err != nil {
		return fmt.Errorf("failed to create temp file: %w", err)
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName) // no-op once the rename succeeded

	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return fmt.Errorf("failed to write temp file: %w", err)
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return fmt.Errorf("failed to sync temp file: %w", err)
	}
	if err := tmp.Chmod(perm); err != nil {
		tmp.Close()
		return fmt.Errorf("failed to set file permissions: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("failed to close temp file: %w", err)
	}

	if err := os.Rename(tmpName, path); err != nil {
		return fmt.Errorf("failed to replace file: %w", err)
	}
	return nil
}
