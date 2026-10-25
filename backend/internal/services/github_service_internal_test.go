package services

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-git/go-git/v5"
	gitconfig "github.com/go-git/go-git/v5/config"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"
	"github.com/go-git/go-git/v5/plumbing/transport"
	"github.com/go-git/go-git/v5/plumbing/transport/client"
	githttp "github.com/go-git/go-git/v5/plumbing/transport/http"
	"github.com/go-git/go-git/v5/plumbing/transport/server"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/oauth2"

	appconfig "github.com/MorrisMorrison/schist/internal/config"
	"github.com/MorrisMorrison/schist/internal/crypto"
)

// These tests never touch the network. GitHub API calls go to an httptest
// server: the service builds its clients with oauth2.NewClient(gs.ctx, …),
// which honours an *http.Client stored under oauth2.HTTPClient in the
// context, so the test context carries one whose transport rewrites every
// request to the fake. Pushes to https://github.com/<owner>/<repo>.git are
// served in-process from a local bare repository by go-git's server
// transport, installed for the "https" scheme for the duration of a test.

const (
	testOwner = "octo"
	testRepo  = "notes"
	testToken = "ghp_test_token"
)

type fakeGitHub struct {
	mu            sync.Mutex
	repos         map[string]string   // "owner/repo" -> default branch
	branches      map[string][]string // "owner/repo" -> branches
	authorization []string
}

func newFakeGitHub() *fakeGitHub {
	return &fakeGitHub{
		repos:    map[string]string{testOwner + "/" + testRepo: "main"},
		branches: map[string][]string{testOwner + "/" + testRepo: {"main", "trunk"}},
	}
}

func (f *fakeGitHub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.authorization = append(f.authorization, r.Header.Get("Authorization"))

	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 3 || parts[0] != "repos" {
		http.NotFound(w, r)
		return
	}
	full := parts[1] + "/" + parts[2]
	defaultBranch, ok := f.repos[full]
	if !ok {
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"message":"Not Found"}`))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	switch {
	case len(parts) == 3:
		_ = json.NewEncoder(w).Encode(map[string]any{
			"name":           parts[2],
			"full_name":      full,
			"description":    "my notes",
			"private":        true,
			"html_url":       "https://github.com/" + full,
			"clone_url":      "https://github.com/" + full + ".git",
			"default_branch": defaultBranch,
		})
	case len(parts) == 5 && parts[3] == "branches":
		for _, b := range f.branches[full] {
			if b == parts[4] {
				_ = json.NewEncoder(w).Encode(map[string]any{"name": b})
				return
			}
		}
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"message":"Branch not found"}`))
	default:
		http.NotFound(w, r)
	}
}

func (f *fakeGitHub) lastAuthorization() string {
	f.mu.Lock()
	defer f.mu.Unlock()
	if len(f.authorization) == 0 {
		return ""
	}
	return f.authorization[len(f.authorization)-1]
}

type rewriteTransport struct{ target *url.URL }

func (rt rewriteTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	r2 := r.Clone(r.Context())
	r2.URL.Scheme = rt.target.Scheme
	r2.URL.Host = rt.target.Host
	r2.Host = rt.target.Host
	return http.DefaultTransport.RoundTrip(r2)
}

// fakeAPIContext returns a context whose oauth2 HTTP client talks to api.
func fakeAPIContext(t *testing.T, api http.Handler) context.Context {
	t.Helper()
	srv := httptest.NewServer(api)
	t.Cleanup(srv.Close)
	target, err := url.Parse(srv.URL)
	require.NoError(t, err)
	return context.WithValue(context.Background(), oauth2.HTTPClient,
		&http.Client{Transport: rewriteTransport{target: target}})
}

// installLocalRemote serves pushes to the GitHub URL of owner/repo from a new
// local bare repository and returns its directory.
func installLocalRemote(t *testing.T, owner, repo string) string {
	t.Helper()
	remoteDir := t.TempDir()
	bare, err := git.PlainInit(remoteDir, true)
	require.NoError(t, err)

	ep, err := transport.NewEndpoint("https://github.com/" + owner + "/" + repo + ".git")
	require.NoError(t, err)
	client.InstallProtocol("https", server.NewClient(server.MapLoader{ep.String(): bare.Storer}))
	t.Cleanup(func() { client.InstallProtocol("https", githttp.DefaultClient) })
	return remoteDir
}

func remoteBranchHash(t *testing.T, remoteDir, branch string) plumbing.Hash {
	t.Helper()
	repo, err := git.PlainOpen(remoteDir)
	require.NoError(t, err)
	ref, err := repo.Reference(plumbing.NewBranchReferenceName(branch), true)
	require.NoError(t, err)
	return ref.Hash()
}

func remoteFiles(t *testing.T, remoteDir, branch string) []string {
	t.Helper()
	repo, err := git.PlainOpen(remoteDir)
	require.NoError(t, err)
	commit, err := repo.CommitObject(remoteBranchHash(t, remoteDir, branch))
	require.NoError(t, err)
	tree, err := commit.Tree()
	require.NoError(t, err)
	var files []string
	require.NoError(t, tree.Files().ForEach(func(f *object.File) error {
		files = append(files, f.Name)
		return nil
	}))
	return files
}

type githubFixture struct {
	gs       *GitHubService
	dataDir  string
	settings *appconfig.Settings
	secrets  *SecretManager
	api      *fakeGitHub
}

// unlockForTest unlocks sm with a fixed key, as a verified passkey would.
func unlockForTest(t *testing.T, sm *SecretManager) {
	t.Helper()
	store, err := crypto.NewSecureStoreWithKey([]byte("0123456789abcdef0123456789abcdef"), []byte("0123456789abcdef"))
	require.NoError(t, err)
	sm.store = store
	sm.unlocked = true
}

func newGitHubFixture(t *testing.T, gh *appconfig.GitHubSettings) *githubFixture {
	t.Helper()
	dataDir := t.TempDir()
	settings, err := appconfig.LoadSettings(dataDir)
	require.NoError(t, err)
	if gh != nil {
		require.NoError(t, settings.UpdateGitHubSettings(dataDir, gh))
	}
	gitService, err := NewGitService(dataDir)
	require.NoError(t, err)
	sm := NewSecretManager(settings, dataDir, nil)

	api := newFakeGitHub()
	gs := NewGitHubService(&appconfig.Config{DataDir: dataDir}, gitService, settings, sm)
	gs.ctx = fakeAPIContext(t, api)
	gs.client = nil // rebuilt lazily on the fake-API context
	return &githubFixture{gs: gs, dataDir: dataDir, settings: settings, secrets: sm, api: api}
}

func enabledSettings() *appconfig.GitHubSettings {
	return &appconfig.GitHubSettings{
		Enabled:    true,
		Owner:      testOwner,
		Repository: testRepo,
		Branch:     "main",
		Token:      crypto.NewEncryptedValue(testToken, false),
	}
}

func writeNote(t *testing.T, dir, name, content string) {
	t.Helper()
	require.NoError(t, os.WriteFile(filepath.Join(dir, name), []byte(content), 0644))
}

func TestGitHubService_NewInitializesClientOnlyWithUsableToken(t *testing.T) {
	tests := []struct {
		name       string
		gh         *appconfig.GitHubSettings
		wantClient bool
	}{
		{"disabled", &appconfig.GitHubSettings{Enabled: false, Token: crypto.NewEncryptedValue("t", false)}, false},
		{"enabled without token", &appconfig.GitHubSettings{Enabled: true}, false},
		{"enabled with plaintext token", enabledSettings(), true},
		{"enabled with encrypted token, store locked", &appconfig.GitHubSettings{
			Enabled: true, Token: &crypto.EncryptedValue{Encrypted: true, Value: "x", Nonce: "y"}}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dataDir := t.TempDir()
			settings, err := appconfig.LoadSettings(dataDir)
			require.NoError(t, err)
			require.NoError(t, settings.UpdateGitHubSettings(dataDir, tt.gh))
			gs := NewGitHubService(&appconfig.Config{DataDir: dataDir}, nil, settings, NewSecretManager(settings, dataDir, nil))
			assert.Equal(t, tt.wantClient, gs.client != nil)
		})
	}
}

func TestGitHubService_GetToken(t *testing.T) {
	t.Run("not configured", func(t *testing.T) {
		f := newGitHubFixture(t, nil)
		_, err := f.gs.getToken()
		assert.ErrorContains(t, err, "not configured")
	})

	t.Run("plaintext token", func(t *testing.T) {
		f := newGitHubFixture(t, enabledSettings())
		token, err := f.gs.getToken()
		require.NoError(t, err)
		assert.Equal(t, testToken, token)
	})

	t.Run("encrypted token needs an unlocked store", func(t *testing.T) {
		f := newGitHubFixture(t, &appconfig.GitHubSettings{Enabled: true})
		unlockForTest(t, f.secrets)
		require.NoError(t, f.secrets.SetGitHubToken(testToken))
		require.True(t, f.settings.GitHub.Token.Encrypted, "token must be stored encrypted")

		token, err := f.gs.getToken()
		require.NoError(t, err)
		assert.Equal(t, testToken, token)
		assert.True(t, f.gs.hasToken())

		f.secrets.Lock()
		_, err = f.gs.getToken()
		assert.ErrorContains(t, err, "locked")
		assert.False(t, f.gs.hasToken())
		assert.True(t, f.gs.hasTokenNoDecrypt())
	})
}

func TestGitHubService_TestConnection(t *testing.T) {
	tests := []struct {
		name                 string
		token, owner, repo   string
		branch               string
		wantErr              string
		configureDefaultRepo string
	}{
		{name: "missing token", owner: testOwner, repo: testRepo, wantErr: "token is required"},
		{name: "missing owner", token: testToken, repo: testRepo, wantErr: "owner is required"},
		{name: "missing repo", token: testToken, owner: testOwner, wantErr: "name is required"},
		{name: "unknown repository", token: testToken, owner: testOwner, repo: "nope", wantErr: "failed to access repository"},
		{name: "unknown branch", token: testToken, owner: testOwner, repo: testRepo, branch: "gone", wantErr: "failed to access branch gone"},
		{name: "explicit branch", token: testToken, owner: testOwner, repo: testRepo, branch: "trunk"},
		{name: "empty branch uses default branch", token: testToken, owner: testOwner, repo: testRepo},
		{name: "main falls back to a non-main default branch", token: testToken, owner: testOwner, repo: testRepo,
			branch: "main", configureDefaultRepo: "trunk"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := newGitHubFixture(t, nil)
			if tt.configureDefaultRepo != "" {
				f.api.repos[testOwner+"/"+testRepo] = tt.configureDefaultRepo
				f.api.branches[testOwner+"/"+testRepo] = []string{tt.configureDefaultRepo}
			}
			err := f.gs.TestConnection(tt.token, tt.owner, tt.repo, tt.branch)
			if tt.wantErr != "" {
				assert.ErrorContains(t, err, tt.wantErr)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, "Bearer "+testToken, f.api.lastAuthorization())
		})
	}
}

func TestGitHubService_SetupRepository(t *testing.T) {
	validReq := func() *GitHubSetupRequest {
		return &GitHubSetupRequest{Token: testToken, Owner: testOwner, Repo: testRepo, AutoSync: true}
	}

	t.Run("validation and lookup failures save nothing", func(t *testing.T) {
		tests := []struct {
			name    string
			mutate  func(*GitHubSetupRequest)
			unlock  bool
			wantErr string
		}{
			{"missing token", func(r *GitHubSetupRequest) { r.Token = "" }, true, "token is required"},
			{"missing owner", func(r *GitHubSetupRequest) { r.Owner = "" }, true, "owner is required"},
			{"missing repo", func(r *GitHubSetupRequest) { r.Repo = "" }, true, "name is required"},
			{"unknown repository", func(r *GitHubSetupRequest) { r.Repo = "nope" }, true, "failed to access repository"},
			{"unknown branch", func(r *GitHubSetupRequest) { r.Branch = "gone" }, true, "branch gone not found"},
			{"secret store locked", func(r *GitHubSetupRequest) {}, false, "must be unlocked"},
		}
		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				f := newGitHubFixture(t, nil)
				if tt.unlock {
					unlockForTest(t, f.secrets)
				}
				req := validReq()
				tt.mutate(req)

				info, err := f.gs.SetupRepository(req)
				assert.ErrorContains(t, err, tt.wantErr)
				assert.Nil(t, info)
				assert.False(t, f.settings.GitHub.Enabled)
				assert.Nil(t, f.settings.GitHub.Token)
			})
		}
	})

	t.Run("success stores an encrypted token and points origin at the repo", func(t *testing.T) {
		f := newGitHubFixture(t, nil)
		unlockForTest(t, f.secrets)
		f.api.repos[testOwner+"/"+testRepo] = "trunk"

		info, err := f.gs.SetupRepository(validReq())
		require.NoError(t, err)
		assert.Equal(t, &GitHubRepoInfo{
			Owner:       testOwner,
			Name:        testRepo,
			FullName:    testOwner + "/" + testRepo,
			Description: "my notes",
			Private:     true,
			HTMLURL:     "https://github.com/" + testOwner + "/" + testRepo,
			CloneURL:    "https://github.com/" + testOwner + "/" + testRepo + ".git",
		}, info)

		gh := f.settings.GetGitHubSettings()
		assert.True(t, gh.Enabled)
		assert.Equal(t, "trunk", gh.Branch, "empty branch takes the repository default")
		assert.True(t, gh.AutoSync)
		require.NotNil(t, gh.Token)
		assert.True(t, gh.Token.Encrypted, "the token must never be persisted in plaintext")
		assert.NotContains(t, gh.Token.Value, testToken)

		onDisk, err := os.ReadFile(filepath.Join(f.dataDir, ".schist", "config.json"))
		require.NoError(t, err)
		assert.NotContains(t, string(onDisk), testToken)

		assert.NotNil(t, f.gs.client)
		cfg, err := f.gs.gitService.repository.Config()
		require.NoError(t, err)
		assert.Equal(t, []string{"https://github.com/octo/notes.git"}, cfg.Remotes["origin"].URLs)
	})

	t.Run("without a git repository the remote cannot be set", func(t *testing.T) {
		f := newGitHubFixture(t, nil)
		unlockForTest(t, f.secrets)
		f.gs.gitService = nil

		_, err := f.gs.SetupRepository(validReq())
		assert.ErrorContains(t, err, "failed to setup git remote")
	})
}

func TestGitHubService_GetGitHubConnectionStatus(t *testing.T) {
	t.Run("no token", func(t *testing.T) {
		f := newGitHubFixture(t, nil)
		status, err := f.gs.GetGitHubConnectionStatus()
		require.NoError(t, err)
		assert.Equal(t, &GitHubConnectionStatus{}, status)
	})

	t.Run("encrypted token while locked is reported but not connected", func(t *testing.T) {
		f := newGitHubFixture(t, &appconfig.GitHubSettings{
			Enabled: true, Owner: testOwner, Repository: testRepo,
			Token: &crypto.EncryptedValue{Encrypted: true, Value: "x", Nonce: "y"},
		})
		status, err := f.gs.GetGitHubConnectionStatus()
		require.NoError(t, err)
		assert.True(t, status.TokenExists)
		assert.False(t, status.Connected)
	})

	t.Run("reachable repository", func(t *testing.T) {
		f := newGitHubFixture(t, enabledSettings())
		status, err := f.gs.GetGitHubConnectionStatus()
		require.NoError(t, err)
		assert.True(t, status.TokenExists)
		assert.True(t, status.Connected)
		assert.Equal(t, 0, status.PendingChanges)
	})

	t.Run("token but no repository configured", func(t *testing.T) {
		gh := enabledSettings()
		gh.Owner, gh.Repository = "", ""
		f := newGitHubFixture(t, gh)
		status, err := f.gs.GetGitHubConnectionStatus()
		require.NoError(t, err)
		assert.False(t, status.Connected)
	})

	t.Run("unreachable repository", func(t *testing.T) {
		gh := enabledSettings()
		gh.Repository = "gone"
		f := newGitHubFixture(t, gh)
		status, err := f.gs.GetGitHubConnectionStatus()
		assert.ErrorContains(t, err, "repository connection failed")
		require.NotNil(t, status)
		assert.False(t, status.Connected)
	})
}

func TestGitHubService_UpdateConfiguration(t *testing.T) {
	boolPtr := func(b bool) *bool { return &b }
	strPtr := func(s string) *string { return &s }

	t.Run("not enabled", func(t *testing.T) {
		f := newGitHubFixture(t, nil)
		err := f.gs.UpdateConfiguration(&GitHubConfigRequest{AutoSync: boolPtr(true)})
		assert.ErrorContains(t, err, "not enabled")
		assert.False(t, f.settings.GitHub.AutoSync)
	})

	t.Run("toggles flags and switches to an existing branch", func(t *testing.T) {
		f := newGitHubFixture(t, enabledSettings())
		require.NoError(t, f.gs.ensureClient())

		err := f.gs.UpdateConfiguration(&GitHubConfigRequest{
			AutoSync: boolPtr(true), SyncOnSave: boolPtr(true), Branch: strPtr("trunk"),
		})
		require.NoError(t, err)
		gh := f.settings.GetGitHubSettings()
		assert.True(t, gh.AutoSync)
		assert.True(t, gh.SyncOnSave)
		assert.Equal(t, "trunk", gh.Branch)
		assert.True(t, f.gs.ShouldAutoSync())
		assert.True(t, f.gs.ShouldSyncOnSave())

		reloaded, err := appconfig.LoadSettings(f.dataDir)
		require.NoError(t, err)
		assert.Equal(t, "trunk", reloaded.GitHub.Branch, "change must be persisted")
	})

	t.Run("unknown branch is rejected and nothing changes", func(t *testing.T) {
		f := newGitHubFixture(t, enabledSettings())
		require.NoError(t, f.gs.ensureClient())

		err := f.gs.UpdateConfiguration(&GitHubConfigRequest{AutoSync: boolPtr(true), Branch: strPtr("gone")})
		assert.ErrorContains(t, err, "branch gone not found")
		assert.Equal(t, "main", f.settings.GitHub.Branch)
		assert.False(t, f.settings.GitHub.AutoSync)
	})

	t.Run("without a client the branch is taken as given; empty branch is ignored", func(t *testing.T) {
		f := newGitHubFixture(t, enabledSettings())
		require.NoError(t, f.gs.UpdateConfiguration(&GitHubConfigRequest{Branch: strPtr("release")}))
		assert.Equal(t, "release", f.settings.GitHub.Branch)
		require.NoError(t, f.gs.UpdateConfiguration(&GitHubConfigRequest{Branch: strPtr("")}))
		assert.Equal(t, "release", f.settings.GitHub.Branch)
	})
}

func TestGitHubService_SyncToGitHub_Preconditions(t *testing.T) {
	t.Run("not enabled", func(t *testing.T) {
		f := newGitHubFixture(t, nil)
		result, err := f.gs.SyncToGitHub()
		assert.ErrorContains(t, err, "not enabled")
		assert.Nil(t, result)
	})

	t.Run("enabled without a token", func(t *testing.T) {
		gh := enabledSettings()
		gh.Token = nil
		f := newGitHubFixture(t, gh)
		_, err := f.gs.SyncToGitHub()
		assert.ErrorContains(t, err, "failed to initialize github client")
	})

	t.Run("encrypted token while locked", func(t *testing.T) {
		gh := enabledSettings()
		gh.Token = &crypto.EncryptedValue{Encrypted: true, Value: "x", Nonce: "y"}
		f := newGitHubFixture(t, gh)
		_, err := f.gs.SyncToGitHub()
		assert.ErrorContains(t, err, "locked")
	})

	t.Run("no git service", func(t *testing.T) {
		f := newGitHubFixture(t, enabledSettings())
		f.gs.gitService = nil
		_, err := f.gs.SyncToGitHub()
		assert.ErrorContains(t, err, "git service not available")
	})

	t.Run("repository unreachable is reported in the result", func(t *testing.T) {
		gh := enabledSettings()
		gh.Repository = "gone"
		f := newGitHubFixture(t, gh)
		result, err := f.gs.SyncToGitHub()
		require.NoError(t, err)
		assert.False(t, result.Success)
		assert.Equal(t, "Failed to connect to GitHub repository", result.Message)
		assert.NotEmpty(t, result.Errors)
		assert.True(t, f.settings.GitHub.LastSync.IsZero())
	})
}

func TestGitHubService_SyncToGitHub_PushesNotesButNeverAppState(t *testing.T) {
	f := newGitHubFixture(t, enabledSettings())
	remoteDir := installLocalRemote(t, testOwner, testRepo)

	writeNote(t, f.dataDir, "note.md", "# Note\n")
	us := NewUserService(f.dataDir)
	require.NoError(t, us.CreateFirstUser("admin", "cred-1"))
	_, err := us.GenerateInviteToken("admin")
	require.NoError(t, err)

	before := time.Now()
	result, err := f.gs.SyncToGitHub()
	require.NoError(t, err)
	require.True(t, result.Success, "sync failed: %s %v", result.Message, result.Errors)
	assert.Equal(t, "GitHub sync completed successfully", result.Message)
	assert.False(t, f.settings.GitHub.LastSync.Before(before), "LastSync must be updated")

	files := remoteFiles(t, remoteDir, "main")
	assert.Contains(t, files, "note.md")
	for _, file := range files {
		assert.False(t, isAppStatePath(file), "app state %q must never be pushed", file)
	}

	local, err := f.gs.gitService.repository.Head()
	require.NoError(t, err)
	assert.Equal(t, local.Hash(), remoteBranchHash(t, remoteDir, "main"))

	t.Run("second sync with nothing new is already up to date", func(t *testing.T) {
		result, err := f.gs.SyncToGitHub()
		require.NoError(t, err)
		assert.True(t, result.Success, "%s %v", result.Message, result.Errors)
	})
}

// pushDivergingCommit puts a commit the local repository does not have on the
// remote branch, as another device syncing to the same repository would.
func pushDivergingCommit(t *testing.T, branch string) plumbing.Hash {
	t.Helper()
	otherDir := t.TempDir()
	other, err := git.PlainInit(otherDir, false)
	require.NoError(t, err)
	writeNote(t, otherDir, "other-device.md", "# From another device\n")
	wt, err := other.Worktree()
	require.NoError(t, err)
	_, err = wt.Add("other-device.md")
	require.NoError(t, err)
	hash, err := wt.Commit("other device", &git.CommitOptions{
		Author: &object.Signature{Name: "o", Email: "o@example.com", When: time.Now()},
	})
	require.NoError(t, err)
	_, err = other.CreateRemote(&gitconfig.RemoteConfig{
		Name: "origin", URLs: []string{"https://github.com/" + testOwner + "/" + testRepo + ".git"},
	})
	require.NoError(t, err)
	head, err := other.Head()
	require.NoError(t, err)
	require.NoError(t, other.Push(&git.PushOptions{
		RemoteName: "origin",
		RefSpecs:   []gitconfig.RefSpec{gitconfig.RefSpec(head.Name().String() + ":refs/heads/" + branch)},
	}))
	return hash
}

func TestGitHubService_SyncToGitHub_DivergedRemote(t *testing.T) {
	t.Run("default push refuses to overwrite remote history", func(t *testing.T) {
		f := newGitHubFixture(t, enabledSettings())
		remoteDir := installLocalRemote(t, testOwner, testRepo)
		remoteHead := pushDivergingCommit(t, "main")
		writeNote(t, f.dataDir, "note.md", "# Local\n")

		result, err := f.gs.SyncToGitHub()
		require.NoError(t, err)
		assert.False(t, result.Success)
		assert.Equal(t, "Failed to push to GitHub", result.Message)
		assert.Equal(t, remoteHead, remoteBranchHash(t, remoteDir, "main"), "remote commits must not be clobbered")
		assert.True(t, f.settings.GitHub.LastSync.IsZero(), "a failed sync must not record LastSync")
	})

	t.Run("opt-in force push replaces the remote branch", func(t *testing.T) {
		gh := enabledSettings()
		gh.ForcePush = true
		f := newGitHubFixture(t, gh)
		remoteDir := installLocalRemote(t, testOwner, testRepo)
		pushDivergingCommit(t, "main")
		writeNote(t, f.dataDir, "note.md", "# Local\n")

		result, err := f.gs.SyncToGitHub()
		require.NoError(t, err)
		require.True(t, result.Success, "%s %v", result.Message, result.Errors)

		local, err := f.gs.gitService.repository.Head()
		require.NoError(t, err)
		assert.Equal(t, local.Hash(), remoteBranchHash(t, remoteDir, "main"))
	})
}

func TestGitHubService_SyncToGitHub_RepairsMissingGitDir(t *testing.T) {
	f := newGitHubFixture(t, enabledSettings())
	remoteDir := installLocalRemote(t, testOwner, testRepo)
	writeNote(t, f.dataDir, "note.md", "# Note\n")
	require.NoError(t, os.RemoveAll(filepath.Join(f.dataDir, ".git")))

	result, err := f.gs.SyncToGitHub()
	require.NoError(t, err)
	require.True(t, result.Success, "%s %v", result.Message, result.Errors)

	_, err = os.Stat(filepath.Join(f.dataDir, "note.md"))
	assert.NoError(t, err, "repair must not touch notes")
	assert.Contains(t, remoteFiles(t, remoteDir, "main"), "note.md")
}

func TestGitHubService_SyncHelpersWithoutRepository(t *testing.T) {
	f := newGitHubFixture(t, enabledSettings())
	f.gs.gitService = nil

	assert.ErrorContains(t, f.gs.setupGitRemote(), "not available")
	assert.ErrorContains(t, f.gs.commitUncommittedChanges(), "not available")
	_, err := f.gs.countLocalCommits()
	assert.ErrorContains(t, err, "not available")
	assert.ErrorContains(t, f.gs.pushToGitHub(), "not available")

	f.gs.gitService = &GitService{dataDir: f.dataDir}
	assert.ErrorContains(t, f.gs.setupGitRemote(), "not available")
}

func TestGitHubService_CountLocalCommits(t *testing.T) {
	f := newGitHubFixture(t, enabledSettings())
	n, err := f.gs.countLocalCommits()
	require.NoError(t, err)
	assert.Equal(t, 1, n, "a new repository has only the initial commit")

	writeNote(t, f.dataDir, "note.md", "# Note\n")
	require.NoError(t, f.gs.commitUncommittedChanges())
	n, err = f.gs.countLocalCommits()
	require.NoError(t, err)
	assert.Equal(t, 2, n)
}

func TestGitHubService_PushWithoutTokenFails(t *testing.T) {
	gh := enabledSettings()
	gh.Token = nil
	f := newGitHubFixture(t, gh)
	assert.ErrorContains(t, f.gs.pushToGitHub(), "failed to get GitHub token")
}

func TestGitHubService_DisconnectClearsClientAndToken(t *testing.T) {
	f := newGitHubFixture(t, enabledSettings())
	require.NoError(t, f.gs.ensureClient())
	require.NoError(t, f.gs.Disconnect())
	assert.Nil(t, f.gs.client)
	assert.Nil(t, f.settings.GitHub.Token)
	assert.False(t, f.gs.IsEnabled())

	t.Run("persisting failure is returned", func(t *testing.T) {
		f := newGitHubFixture(t, enabledSettings())
		f.gs.dataDir = filepath.Join(t.TempDir(), "missing")
		assert.ErrorContains(t, f.gs.Disconnect(), "failed to clear GitHub settings")
	})
}
