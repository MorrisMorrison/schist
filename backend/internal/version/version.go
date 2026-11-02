// Package version holds the Schist version, stamped at build time.
package version

// Version is set with -ldflags "-X github.com/MorrisMorrison/schist/internal/version.Version=..."
// from the release tag (v0.0.1 → 0.0.1); "dev" for local builds.
var Version = "dev"
