package services

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/MorrisMorrison/schist/internal/utils"
)

// jsonStore is a JSON file holding one value of type T (users, shares,
// passkeys) that is always read and rewritten as a whole. Every
// read-modify-write cycle runs under the store's mutex, so concurrent requests
// cannot drop each other's changes, and every write is atomic (temp file +
// rename), so a crash can never leave a torn file behind. Use it for any new
// store.
type jsonStore[T any] struct {
	path string
	perm os.FileMode
	// name describes the file in error messages, e.g. "users file".
	name string
	// empty returns the value of a store whose file does not exist yet.
	empty func() T
	// emptyFileOK treats a zero-length file like a missing one. Leave it off
	// for stores where "empty" grants something (no users = first-time setup),
	// so a truncated file fails loudly instead.
	emptyFileOK bool

	mu sync.Mutex
}

// read returns the current contents of the store.
func (s *jsonStore[T]) read() (T, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.load()
}

// update loads the store, applies fn and saves the result, all under the
// store's lock. When fn returns an error nothing is written and the error is
// returned as is.
func (s *jsonStore[T]) update(fn func(*T) error) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	value, err := s.load()
	if err != nil {
		return err
	}
	if err := fn(&value); err != nil {
		return err
	}
	return s.save(value)
}

// load reads the file. Callers must hold s.mu.
func (s *jsonStore[T]) load() (T, error) {
	data, err := os.ReadFile(s.path)
	if os.IsNotExist(err) || (err == nil && len(data) == 0 && s.emptyFileOK) {
		return s.empty(), nil
	}
	if err != nil {
		var zero T
		return zero, fmt.Errorf("failed to read %s: %w", s.name, err)
	}

	var value T
	if err := json.Unmarshal(data, &value); err != nil {
		var zero T
		return zero, fmt.Errorf("failed to parse %s: %w", s.name, err)
	}
	return value, nil
}

// save writes value atomically, creating the parent directory if needed.
// Callers must hold s.mu.
func (s *jsonStore[T]) save(value T) error {
	if err := os.MkdirAll(filepath.Dir(s.path), 0755); err != nil {
		return fmt.Errorf("failed to create directory for %s: %w", s.name, err)
	}

	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal %s: %w", s.name, err)
	}

	if err := utils.WriteFileAtomic(s.path, data, s.perm); err != nil {
		return fmt.Errorf("failed to write %s: %w", s.name, err)
	}
	return nil
}
