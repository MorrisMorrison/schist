package services_test

import (
	"os"
	"testing"
)

// skipIfRoot skips tests that rely on filesystem DAC permission enforcement.
// As root (euid 0) the kernel bypasses those checks, so negative tests that
// expect a permission/write error instead see the operation succeed. The
// self-hosted CI runner runs as root; locally and on GitHub-hosted runners
// (non-root) these tests run normally.
//
// Centralizing the check here means a new permission-sensitive test only needs a
// single skipIfRoot(t) call rather than its own copy of the euid dance.
func skipIfRoot(t *testing.T) {
	t.Helper()
	if os.Geteuid() == 0 {
		t.Skip("skipping: relies on filesystem permissions that root bypasses")
	}
}
