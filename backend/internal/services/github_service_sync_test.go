package services

import (
	"errors"
	"testing"
	"time"

	"github.com/go-git/go-git/v5/plumbing"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/MorrisMorrison/schist/internal/crypto"
	apierrors "github.com/MorrisMorrison/schist/internal/errors"
)

func errorCode(err error) apierrors.ErrorCode {
	var apiErr *apierrors.APIError
	if errors.As(err, &apiErr) {
		return apiErr.Code
	}
	return ""
}

func TestDecidePush(t *testing.T) {
	local := plumbing.NewHash("1111111111111111111111111111111111111111")
	remote := plumbing.NewHash("2222222222222222222222222222222222222222")
	ancestor := func(yes bool) func() (bool, error) {
		return func() (bool, error) { return yes, nil }
	}
	tests := []struct {
		name       string
		remote     plumbing.Hash
		isAncestor func() (bool, error)
		want       pushAction
		wantErr    bool
	}{
		{"missing remote branch is created", plumbing.ZeroHash, nil, pushCreate, false},
		{"same commit is up to date", local, nil, pushNone, false},
		{"remote behind local fast-forwards", remote, ancestor(true), pushFastForward, false},
		{"remote with other commits has diverged", remote, ancestor(false), pushDiverged, false},
		{"ancestry check failure is an error", remote, func() (bool, error) { return false, errors.New("boom") }, 0, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := decidePush(tt.remote, local, tt.isAncestor)
			if tt.wantErr {
				assert.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestGitHubService_SetupRepository_NewRepositories(t *testing.T) {
	t.Run("empty repository: setup succeeds and the first sync creates the branch", func(t *testing.T) {
		f := newGitHubFixture(t, nil)
		unlockForTest(t, f.secrets)
		f.api.branches[testOwner+"/"+testRepo] = nil // no commits, no branches
		remoteDir := installLocalRemote(t, testOwner, testRepo)

		info, err := f.gs.SetupRepository(&GitHubSetupRequest{Token: testToken, Owner: testOwner, Repo: testRepo})
		require.NoError(t, err)
		assert.Equal(t, "main", info.Branch, "an empty repository still reports its default branch")
		assert.False(t, info.BranchExists)
		assert.True(t, f.settings.GetGitHubSettings().Enabled)

		writeNote(t, f.dataDir, "note.md", "# Note\n")
		result, err := f.gs.SyncToGitHub()
		require.NoError(t, err)
		assert.True(t, result.Success)
		assert.Contains(t, remoteFiles(t, remoteDir, "main"), "note.md")
	})

	t.Run("a branch that doesn't exist yet is accepted and created on sync", func(t *testing.T) {
		f := newGitHubFixture(t, nil)
		unlockForTest(t, f.secrets)
		remoteDir := installLocalRemote(t, testOwner, testRepo)

		info, err := f.gs.SetupRepository(&GitHubSetupRequest{Token: testToken, Owner: testOwner, Repo: testRepo, Branch: "backup"})
		require.NoError(t, err)
		assert.Equal(t, "backup", info.Branch)
		assert.False(t, info.BranchExists)
		assert.Equal(t, "backup", f.settings.GetGitHubSettings().Branch)

		_, err = f.gs.SyncToGitHub()
		require.NoError(t, err)
		local, err := f.gs.gitService.repository.Head()
		require.NoError(t, err)
		assert.Equal(t, local.Hash(), remoteBranchHash(t, remoteDir, "backup"))
	})

	t.Run("an existing branch is reported as existing", func(t *testing.T) {
		f := newGitHubFixture(t, nil)
		unlockForTest(t, f.secrets)
		info, err := f.gs.SetupRepository(&GitHubSetupRequest{Token: testToken, Owner: testOwner, Repo: testRepo, Branch: "trunk"})
		require.NoError(t, err)
		assert.True(t, info.BranchExists)
	})
}

func TestGitHubService_SetupRepository_TypedErrors(t *testing.T) {
	tests := []struct {
		name     string
		req      GitHubSetupRequest
		unlock   bool
		wantCode apierrors.ErrorCode
		noCalls  bool
	}{
		{"missing token", GitHubSetupRequest{Owner: testOwner, Repo: testRepo}, true, apierrors.ErrCodeValidation, true},
		{"secret store locked fails before any GitHub call",
			GitHubSetupRequest{Token: testToken, Owner: testOwner, Repo: testRepo}, false, apierrors.ErrCodeSecretsLocked, true},
		{"unknown repository", GitHubSetupRequest{Token: testToken, Owner: testOwner, Repo: "nope"}, true, apierrors.ErrCodeNotFound, false},
		{"token rejected by GitHub", GitHubSetupRequest{Token: "ghp_revoked", Owner: testOwner, Repo: testRepo}, true, apierrors.ErrCodeValidation, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := newGitHubFixture(t, nil)
			f.api.rejectToken = "ghp_revoked"
			if tt.unlock {
				unlockForTest(t, f.secrets)
			}
			req := tt.req
			_, err := f.gs.SetupRepository(&req)
			require.Error(t, err)
			assert.Equal(t, tt.wantCode, errorCode(err), "%v", err)
			assert.False(t, f.settings.GetGitHubSettings().Enabled)
			if tt.noCalls {
				assert.Empty(t, f.api.lastAuthorization(), "no GitHub request expected")
			}
		})
	}
}

func TestGitHubService_TestConnection_MissingBranch(t *testing.T) {
	f := newGitHubFixture(t, nil)
	result, err := f.gs.TestConnection(testToken, testOwner, testRepo, "backup")
	require.NoError(t, err)
	assert.Equal(t, "backup", result.Branch)
	assert.False(t, result.BranchExists)
	assert.Contains(t, result.Message, "first sync")

	result, err = f.gs.TestConnection(testToken, testOwner, testRepo, "trunk")
	require.NoError(t, err)
	assert.True(t, result.BranchExists)
}

func TestGitHubService_UpdateConfiguration_NewBranch(t *testing.T) {
	f := newGitHubFixture(t, enabledSettings())
	requireClient(t, f.gs)
	branch := "backup"
	require.NoError(t, f.gs.UpdateConfiguration(&GitHubConfigRequest{Branch: &branch}))
	assert.Equal(t, "backup", f.settings.GetGitHubSettings().Branch)

	t.Run("not enabled is an invalid state", func(t *testing.T) {
		f := newGitHubFixture(t, nil)
		err := f.gs.UpdateConfiguration(&GitHubConfigRequest{Branch: &branch})
		assert.Equal(t, apierrors.ErrCodeInvalidState, errorCode(err))
	})
}

func TestGitHubService_Sync_DivergedRemote(t *testing.T) {
	f := newGitHubFixture(t, enabledSettings())
	remoteDir := installLocalRemote(t, testOwner, testRepo)
	remoteHead := pushDivergingCommit(t, "main") // e.g. "Add a README" on GitHub
	writeNote(t, f.dataDir, "note.md", "# Local\n")

	_, err := f.gs.SyncToGitHub()
	require.Error(t, err)
	assert.Equal(t, apierrors.ErrCodeSyncRemoteDiverged, errorCode(err), "%v", err)
	assert.Equal(t, remoteHead, remoteBranchHash(t, remoteDir, "main"), "remote commits must not be clobbered")

	gh := f.settings.GetGitHubSettings()
	assert.True(t, gh.LastSync.IsZero())
	assert.Equal(t, string(apierrors.ErrCodeSyncRemoteDiverged), gh.LastSyncErrorCode)
	assert.Contains(t, gh.LastSyncError, "aren't in this wiki")
	assert.False(t, gh.LastSyncAttempt.IsZero())

	t.Run("replacing the remote is an explicit one-off", func(t *testing.T) {
		result, err := f.gs.Sync(GitHubSyncOptions{ReplaceRemote: true})
		require.NoError(t, err)
		assert.True(t, result.Success)
		local, err := f.gs.gitService.repository.Head()
		require.NoError(t, err)
		assert.Equal(t, local.Hash(), remoteBranchHash(t, remoteDir, "main"))

		gh := f.settings.GetGitHubSettings()
		assert.Empty(t, gh.LastSyncError, "a successful sync clears the last error")
		assert.Empty(t, gh.LastSyncErrorCode)
		assert.False(t, gh.LastSync.IsZero())
		assert.False(t, gh.ForcePush, "replacing once must not turn on force pushing")
	})

	t.Run("afterwards normal syncs fast-forward", func(t *testing.T) {
		writeNote(t, f.dataDir, "second.md", "# Second\n")
		_, err := f.gs.SyncToGitHub()
		require.NoError(t, err)
		assert.Contains(t, remoteFiles(t, remoteDir, "main"), "second.md")
	})
}

func TestGitHubService_Sync_TypedFailures(t *testing.T) {
	t.Run("not enabled", func(t *testing.T) {
		f := newGitHubFixture(t, nil)
		_, err := f.gs.SyncToGitHub()
		assert.Equal(t, apierrors.ErrCodeInvalidState, errorCode(err))
		assert.True(t, f.settings.GetGitHubSettings().LastSyncAttempt.IsZero(), "nothing to record while disabled")
	})

	t.Run("secret store locked", func(t *testing.T) {
		gh := enabledSettings()
		gh.Token = &crypto.EncryptedValue{Encrypted: true, Value: "x", Nonce: "y"}
		f := newGitHubFixture(t, gh)
		_, err := f.gs.SyncToGitHub()
		assert.Equal(t, apierrors.ErrCodeSecretsLocked, errorCode(err), "%v", err)
		assert.Equal(t, string(apierrors.ErrCodeSecretsLocked), f.settings.GetGitHubSettings().LastSyncErrorCode)
	})

	t.Run("repository gone", func(t *testing.T) {
		gh := enabledSettings()
		gh.Repository = "gone"
		f := newGitHubFixture(t, gh)
		_, err := f.gs.SyncToGitHub()
		assert.Equal(t, apierrors.ErrCodeNotFound, errorCode(err), "%v", err)
		assert.NotEmpty(t, f.settings.GetGitHubSettings().LastSyncError)
	})
}

func TestGitHubService_GetGitHubSettings_ReportsLastSyncStatus(t *testing.T) {
	gh := enabledSettings()
	attempt := time.Date(2026, 11, 3, 10, 0, 0, 0, time.UTC)
	gh.LastSyncAttempt = attempt
	gh.LastSyncError = "Secret store is locked."
	gh.LastSyncErrorCode = string(apierrors.ErrCodeSecretsLocked)
	f := newGitHubFixture(t, gh)
	f.gs.config.GitHubAutoSyncInterval = 20 * time.Minute

	got := f.gs.GetGitHubSettings()
	assert.Equal(t, attempt, got.LastSyncAttempt)
	assert.Equal(t, "Secret store is locked.", got.LastSyncError)
	assert.Equal(t, "SECRETS_LOCKED", got.LastSyncErrorCode)
	assert.Equal(t, 20, got.AutoSyncIntervalMinutes)
}
