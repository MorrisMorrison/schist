package utils

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestEnsureLeadingSlash(t *testing.T) {
	for in, want := range map[string]string{"": "/", "a": "/a", "/a": "/a", "a/b": "/a/b", "//a": "//a"} {
		if got := EnsureLeadingSlash(in); got != want {
			t.Errorf("EnsureLeadingSlash(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestValidateAssetPath(t *testing.T) {
	tests := []struct {
		path string
		want error
	}{
		{"/assets/img.png", nil},
		{"/assets/a.b.c.webp", nil},
		{"", ErrEmptyPath},
		{"assets/img.png", ErrPathMustStartWithSlash},
		{"/assets/../users.json", ErrPathContainsInvalidSegments},
		{"/assets/./img.png", ErrPathContainsInvalidSegments},
		{"/..", ErrPathContainsInvalidSegments},
		{"/assets/img name.png", ErrPathContainsInvalidCharacters},
		{`/assets\..\x.png`, ErrPathContainsInvalidCharacters},
		{"/" + strings.Repeat("a/", MaxPathDepth) + "x.png", ErrPathTooDeep},
	}
	for _, tt := range tests {
		if got := ValidateAssetPath(tt.path); !errors.Is(got, tt.want) {
			t.Errorf("ValidateAssetPath(%q) = %v, want %v", tt.path, got, tt.want)
		}
	}
}

func TestValidatePathDepth(t *testing.T) {
	ok := "/" + strings.Repeat("a/", MaxPathDepth-1) + "a"
	if err := ValidatePath(ok); err != nil {
		t.Errorf("depth %d: %v", MaxPathDepth, err)
	}
	if err := ValidatePath(ok + "/b"); !errors.Is(err, ErrPathTooDeep) {
		t.Errorf("depth %d: got %v, want ErrPathTooDeep", MaxPathDepth+1, err)
	}
}

func TestSafeFilePathStaysInDataDir(t *testing.T) {
	dataDir := t.TempDir()
	got, err := SafeFilePath(dataDir, "/assets/img.png")
	if err != nil {
		t.Fatal(err)
	}
	if want := filepath.Join(dataDir, "assets", "img.png"); got != want {
		t.Errorf("got %q, want %q", got, want)
	}
	for _, bad := range []string{"/../x.png", "/assets/../../x.png", "relative.png", ""} {
		if _, err := SafeFilePath(dataDir, bad); err == nil {
			t.Errorf("SafeFilePath(%q): want error", bad)
		}
	}
}

func TestExtractSlugFromPathEdges(t *testing.T) {
	for in, want := range map[string]string{"": "index", "/": "index", "//": "index", "/a/b/": "b", "a": "a"} {
		if got := ExtractSlugFromPath(in); got != want {
			t.Errorf("ExtractSlugFromPath(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestWriteFileAtomicReplacesWholeFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "note.md")
	if err := os.WriteFile(path, []byte("a much longer original note body"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := WriteFileAtomic(path, []byte("short"), 0600); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "short" {
		t.Errorf("content = %q, want the new content only", got)
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		t.Errorf("temp files left behind: %v", entries)
	}
}

func TestWriteFileAtomicOntoDirectoryKeepsIt(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "target")
	if err := os.Mkdir(target, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(target, "child.md"), []byte("keep"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := WriteFileAtomic(target, []byte("x"), 0644); err == nil {
		t.Fatal("want error when the target is a directory")
	}
	if _, err := os.Stat(filepath.Join(target, "child.md")); err != nil {
		t.Errorf("directory contents must survive: %v", err)
	}
	entries, _ := os.ReadDir(dir)
	if len(entries) != 1 {
		t.Errorf("temp file left behind after failure: %v", entries)
	}
}
