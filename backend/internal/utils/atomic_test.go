package utils

import (
	"os"
	"path/filepath"
	"testing"
)

func TestWriteFileAtomic(t *testing.T) {
	tests := []struct {
		name     string
		existing []byte // nil = no existing file
		data     []byte
	}{
		{name: "creates new file", data: []byte("hello")},
		{name: "replaces existing file", existing: []byte("old content that is longer"), data: []byte("new")},
		{name: "writes empty file", existing: []byte("old"), data: []byte{}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dir := t.TempDir()
			target := filepath.Join(dir, "file.json")
			if tt.existing != nil {
				if err := os.WriteFile(target, tt.existing, 0644); err != nil {
					t.Fatal(err)
				}
			}

			if err := WriteFileAtomic(target, tt.data, 0644); err != nil {
				t.Fatalf("WriteFileAtomic() error = %v", err)
			}

			got, err := os.ReadFile(target)
			if err != nil {
				t.Fatal(err)
			}
			if string(got) != string(tt.data) {
				t.Errorf("content = %q, want %q", got, tt.data)
			}

			entries, err := os.ReadDir(dir)
			if err != nil {
				t.Fatal(err)
			}
			if len(entries) != 1 {
				t.Errorf("expected only the target file to remain, found %d entries", len(entries))
			}
		})
	}
}

func TestWriteFileAtomic_MissingDirLeavesNothing(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "missing", "file.json")

	if err := WriteFileAtomic(target, []byte("x"), 0644); err == nil {
		t.Fatal("expected an error when the parent directory does not exist")
	}
	if _, err := os.Stat(target); !os.IsNotExist(err) {
		t.Errorf("target should not exist after a failed write, stat err = %v", err)
	}
}
