package services

import (
	"context"
	"sync/atomic"
	"testing"
	"time"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing/object"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	appconfig "github.com/MorrisMorrison/schist/internal/config"
	apierrors "github.com/MorrisMorrison/schist/internal/errors"
	"github.com/MorrisMorrison/schist/internal/models"
)

func TestSyncScheduler_DelayIsReadAtEachChange(t *testing.T) {
	p := &schedulerProbe{}
	p.onSave.Store(true)
	var delay atomic.Int64
	delay.Store(int64(time.Hour))
	s := newSyncScheduler(syncSchedulerConfig{
		sync:       func() error { p.calls.Add(1); return nil },
		syncOnSave: p.onSave.Load,
		autoSync:   p.auto.Load,
		debounce:   func() time.Duration { return time.Duration(delay.Load()) },
		maxWait:    2 * time.Hour,
		interval:   time.Hour,
	})
	t.Cleanup(func() { stopScheduler(t, s) })

	s.Notify()
	time.Sleep(30 * time.Millisecond)
	assert.Zero(t, p.calls.Load(), "an hour's delay: nothing yet")

	delay.Store(int64(20 * time.Millisecond))
	s.Notify() // the next edit uses the changed setting
	require.Eventually(t, func() bool { return p.calls.Load() == 1 }, time.Second, 5*time.Millisecond)
}

func stopScheduler(t *testing.T, s *syncScheduler) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	s.Stop(ctx)
}

func TestSyncScheduler_CapNeverShorterThanTheDelay(t *testing.T) {
	assert.Equal(t, syncAfterEditMaxWait, backupMaxWait(2*time.Minute))
	assert.Equal(t, 60*time.Minute, backupMaxWait(60*time.Minute), "a delay longer than the cap wins")
}

func newDelayTestService(t *testing.T) (*GitHubService, *appconfig.Settings) {
	t.Helper()
	dataDir := t.TempDir()
	settings, err := appconfig.LoadSettings(dataDir)
	require.NoError(t, err)
	require.NoError(t, settings.Update(dataDir, func(st *appconfig.Settings) error {
		st.GitHub.Enabled = true
		st.GitHub.Owner, st.GitHub.Repository, st.GitHub.Branch = "o", "r", "main"
		return nil
	}))
	gs := NewGitHubService(&appconfig.Config{DataDir: dataDir}, nil, settings, NewSecretManager(settings, dataDir, nil))
	return gs, settings
}

func TestGitHubService_BackupDelaySetting(t *testing.T) {
	t.Run("defaults to 2 minutes", func(t *testing.T) {
		gs, _ := newDelayTestService(t)
		assert.Equal(t, 2*time.Minute, gs.backupDelay())
		assert.Equal(t, 2, gs.GetGitHubSettings().SyncDelayMinutes)
	})

	t.Run("is saved and returned", func(t *testing.T) {
		gs, settings := newDelayTestService(t)
		minutes := 5
		require.NoError(t, gs.UpdateConfiguration(&GitHubConfigRequest{SyncDelayMinutes: &minutes}))
		assert.Equal(t, 5, settings.GetGitHubSettings().SyncDelayMinutes)
		assert.Equal(t, 5*time.Minute, gs.backupDelay())
		assert.Equal(t, 5, gs.GetGitHubSettings().SyncDelayMinutes)
	})

	t.Run("must be 1 to 60 minutes", func(t *testing.T) {
		gs, settings := newDelayTestService(t)
		for _, bad := range []int{0, -1, 61} {
			minutes := bad
			err := gs.UpdateConfiguration(&GitHubConfigRequest{SyncDelayMinutes: &minutes})
			require.Error(t, err, "%d", bad)
			assert.True(t, apierrors.HasCode(err, apierrors.ErrCodeValidation), "%d: %v", bad, err)
		}
		assert.Zero(t, settings.GetGitHubSettings().SyncDelayMinutes, "nothing saved")
	})
}

func TestGitHubService_SetupRejectsABadDelayBeforeAnyNetworkCall(t *testing.T) {
	gs, _ := newDelayTestService(t)
	minutes := 0
	_, err := gs.SetupRepository(&GitHubSetupRequest{Token: "t", Owner: "o", Repo: "r", SyncDelayMinutes: &minutes})
	require.Error(t, err)
	assert.True(t, apierrors.HasCode(err, apierrors.ErrCodeValidation), "%v", err)
}

func TestDocumentService_AutosaveStartsTheBackupCountdown(t *testing.T) {
	dataDir := t.TempDir()
	gitService, err := NewGitService(dataDir)
	require.NoError(t, err)
	var changes atomic.Int32
	gitService.SetCommitHook(func() { changes.Add(1) })
	ds := NewDocumentService(dataDir, gitService, NewIgnoreService(dataDir))

	doc := &models.Document{MetaData: &models.DocumentMetaData{Title: "Notes", Path: "/notes"}, Content: "first"}
	require.NoError(t, ds.CreateDocument(doc))
	require.Equal(t, int32(1), changes.Load(), "a commit notifies")
	commitsBefore := countCommits(t, dataDir)

	doc.Content = "first\n\ntyped and autosaved"
	require.NoError(t, ds.UpdateDocumentWithSaveType(doc, "auto"))

	assert.Equal(t, int32(2), changes.Load(), "an autosave notifies too")
	assert.Equal(t, commitsBefore, countCommits(t, dataDir), "but makes no commit")
}

func countCommits(t *testing.T, dir string) int {
	t.Helper()
	repo, err := git.PlainOpen(dir)
	require.NoError(t, err)
	iter, err := repo.Log(&git.LogOptions{})
	require.NoError(t, err)
	n := 0
	require.NoError(t, iter.ForEach(func(_ *object.Commit) error { n++; return nil }))
	return n
}
