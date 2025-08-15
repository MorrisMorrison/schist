package services

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"
	"github.com/sergi/go-diff/diffmatchpatch"

	"github.com/MorrisMorrison/schist/internal/models"
	"github.com/MorrisMorrison/schist/internal/serializer"
)

const maxRepairAttempts = 3

type GitService struct {
	dataDir    string
	repository *git.Repository
}

type DocumentVersion struct {
	Hash      string    `json:"hash"`
	Message   string    `json:"message"`
	Author    string    `json:"author"`
	Timestamp time.Time `json:"timestamp"`
	FilePath  string    `json:"file_path"`
}

type DiffLineChangeType string

const (
	ChangeTypeAddition     DiffLineChangeType = "addition"
	ChangeTypeDeletion     DiffLineChangeType = "deletion"
	ChangeTypeModification DiffLineChangeType = "modification"
	ChangeTypeContext      DiffLineChangeType = "context"
)

type DiffLine struct {
	Type       DiffLineChangeType `json:"type"`
	LineNumber int                `json:"line_number"`
	Content    string             `json:"content"`
	OldLine    int                `json:"old_line,omitempty"`
	NewLine    int                `json:"new_line,omitempty"`
}

type DiffResult struct {
	DocumentPath string      `json:"document_path"`
	Hash1        string      `json:"hash1"`
	Hash2        string      `json:"hash2"`
	Lines        []DiffLine  `json:"lines"`
	Summary      DiffSummary `json:"summary"`
}

type DiffSummary struct {
	Additions     int `json:"additions"`
	Deletions     int `json:"deletions"`
	Modifications int `json:"modifications"`
}

func NewGitService(dataDir string) (*GitService, error) {
	log.Printf("[GitService] Initializing Git service with dataDir: %s", dataDir)

	gs := &GitService{
		dataDir: dataDir,
	}

	if err := gs.initializeRepository(); err != nil {
		log.Printf("[GitService] ERROR: Failed to initialize repository: %v", err)
		return nil, fmt.Errorf("failed to initialize git repository: %w", err)
	}

	log.Printf("[GitService] Successfully initialized Git service")
	return gs, nil
}

func (gs *GitService) initializeRepository() error {
	gitDir := filepath.Join(gs.dataDir, ".git")
	log.Printf("[GitService] Checking for Git repository at: %s", gitDir)

	if _, err := os.Stat(gitDir); err == nil {
		log.Printf("[GitService] Found existing Git repository, opening...")
		repo, err := git.PlainOpen(gs.dataDir)
		if err != nil {
			log.Printf("[GitService] ERROR: Failed to open existing repository: %v", err)
			return fmt.Errorf("failed to open existing repository: %w", err)
		}
		gs.repository = repo
		log.Printf("[GitService] Successfully opened existing repository")
		return nil
	}

	log.Printf("[GitService] No existing repository found, initializing new one...")
	repo, err := git.PlainInit(gs.dataDir, false)
	if err != nil {
		log.Printf("[GitService] ERROR: Failed to initialize new repository: %v", err)
		return fmt.Errorf("failed to initialize git repository: %w", err)
	}

	gs.repository = repo
	log.Printf("[GitService] Successfully initialized new repository")

	log.Printf("[GitService] Creating initial commit...")
	if err := gs.createInitialCommit(); err != nil {
		log.Printf("[GitService] ERROR: Failed to create initial commit: %v", err)
		return fmt.Errorf("failed to create initial commit: %w", err)
	}

	log.Printf("[GitService] Repository initialization completed successfully")
	return nil
}

func (gs *GitService) createInitialCommit() error {
	worktree, err := gs.repository.Worktree()
	if err != nil {
		return fmt.Errorf("failed to get worktree: %w", err)
	}

	gitignorePath := filepath.Join(gs.dataDir, ".gitignore")
	if _, err := os.Stat(gitignorePath); os.IsNotExist(err) {
		gitignoreContent := `# Schist auto-generated files
*.tmp
*.bak
.DS_Store
Thumbs.db
`
		if err := os.WriteFile(gitignorePath, []byte(gitignoreContent), 0644); err != nil {
			return fmt.Errorf("failed to create .gitignore: %w", err)
		}
	}

	if _, err := worktree.Add(".gitignore"); err != nil {
		return fmt.Errorf("failed to add .gitignore: %w", err)
	}

	signature := &object.Signature{
		Name:  "Schist System",
		Email: "system@schist.local",
		When:  time.Now(),
	}

	_, err = worktree.Commit("Initial commit - Schist git integration", &git.CommitOptions{
		Author: signature,
	})
	if err != nil {
		return fmt.Errorf("failed to create initial commit: %w", err)
	}

	return nil
}

func (gs *GitService) HealthCheck() error {
	return gs.HealthCheckWithRepair(false)
}

func (gs *GitService) HealthCheckWithRepair(autoRepair bool) error {
	return gs.healthCheckWithRepairAttempts(autoRepair, 0)
}

func (gs *GitService) healthCheckWithRepairAttempts(autoRepair bool, repairAttempts int) error {
	log.Printf("[GitService] Running health check (autoRepair: %v, repairAttempts: %d)...", autoRepair, repairAttempts)

	if gs.repository == nil {
		log.Printf("[GitService] ERROR: Repository is nil")
		if autoRepair {
			if repairAttempts >= maxRepairAttempts {
				return fmt.Errorf("git repository not initialized and maximum repair attempts (%d) reached", maxRepairAttempts)
			}
			log.Printf("[GitService] Auto-repair enabled, attempting to repair repository (attempt %d)...", repairAttempts+1)
			if err := gs.RepairRepository(); err != nil {
				return fmt.Errorf("git repository not initialized and repair failed: %w", err)
			}
			return gs.healthCheckWithRepairAttempts(false, repairAttempts+1)
		}
		return fmt.Errorf("git repository not initialized")
	}

	gitDir := filepath.Join(gs.dataDir, ".git")
	if _, err := os.Stat(gitDir); os.IsNotExist(err) {
		log.Printf("[GitService] ERROR: .git directory does not exist at: %s", gitDir)
		if autoRepair {
			if repairAttempts >= maxRepairAttempts {
				return fmt.Errorf(".git directory not found and maximum repair attempts (%d) reached", maxRepairAttempts)
			}
			log.Printf("[GitService] Auto-repair enabled, attempting to repair repository (attempt %d)...", repairAttempts+1)
			if err := gs.RepairRepository(); err != nil {
				return fmt.Errorf(".git directory not found and repair failed: %w", err)
			}
			return gs.healthCheckWithRepairAttempts(false, repairAttempts+1)
		}
		return fmt.Errorf(".git directory not found at %s", gitDir)
	}

	_, err := gs.repository.Config()
	if err != nil {
		log.Printf("[GitService] ERROR: Failed to get repository config: %v", err)
		if autoRepair {
			if repairAttempts >= maxRepairAttempts {
				return fmt.Errorf("repository config is invalid and maximum repair attempts (%d) reached", maxRepairAttempts)
			}
			log.Printf("[GitService] Auto-repair enabled, attempting to repair repository (attempt %d)...", repairAttempts+1)
			if err := gs.RepairRepository(); err != nil {
				return fmt.Errorf("repository config is invalid and repair failed: %w", err)
			}
			return gs.healthCheckWithRepairAttempts(false, repairAttempts+1)
		}
		return fmt.Errorf("repository config is invalid: %w", err)
	}

	worktree, err := gs.repository.Worktree()
	if err != nil {
		log.Printf("[GitService] ERROR: Failed to get worktree: %v", err)
		if autoRepair {
			if repairAttempts >= maxRepairAttempts {
				return fmt.Errorf("repository worktree is invalid and maximum repair attempts (%d) reached", maxRepairAttempts)
			}
			log.Printf("[GitService] Auto-repair enabled, attempting to repair repository (attempt %d)...", repairAttempts+1)
			if err := gs.RepairRepository(); err != nil {
				return fmt.Errorf("repository worktree is invalid and repair failed: %w", err)
			}
			return gs.healthCheckWithRepairAttempts(false, repairAttempts+1)
		}
		return fmt.Errorf("repository worktree is invalid: %w", err)
	}

	_, err = worktree.Status()
	if err != nil {
		log.Printf("[GitService] ERROR: Failed to get worktree status: %v", err)
		if autoRepair {
			if repairAttempts >= maxRepairAttempts {
				return fmt.Errorf("repository status check failed and maximum repair attempts (%d) reached", maxRepairAttempts)
			}
			log.Printf("[GitService] Auto-repair enabled, attempting to repair repository (attempt %d)...", repairAttempts+1)
			if err := gs.RepairRepository(); err != nil {
				return fmt.Errorf("repository status check failed and repair failed: %w", err)
			}
			return gs.healthCheckWithRepairAttempts(false, repairAttempts+1)
		}
		return fmt.Errorf("repository status check failed: %w", err)
	}

	log.Printf("[GitService] Health check passed successfully")
	return nil
}

func (gs *GitService) IsRepositoryInitialized() bool {
	return gs.repository != nil && gs.HealthCheck() == nil
}

func (gs *GitService) RepairRepository() error {
	log.Printf("[GitService] Starting repository repair process...")

	if gs.repository == nil {
		log.Printf("[GitService] Repository is nil, attempting to reinitialize...")
		if err := gs.initializeRepository(); err != nil {
			log.Printf("[GitService] ERROR: Failed to reinitialize repository: %v", err)
			return fmt.Errorf("failed to reinitialize repository: %w", err)
		}
		log.Printf("[GitService] Repository reinitialized successfully")
		return nil
	}

	gitDir := filepath.Join(gs.dataDir, ".git")
	if _, err := os.Stat(gitDir); os.IsNotExist(err) {
		log.Printf("[GitService] .git directory missing, reinitializing repository...")
		gs.repository = nil
		if err := gs.initializeRepository(); err != nil {
			log.Printf("[GitService] ERROR: Failed to reinitialize repository: %v", err)
			return fmt.Errorf("failed to reinitialize repository after .git directory loss: %w", err)
		}
		log.Printf("[GitService] Repository reinitialized after .git directory loss")
		return nil
	}

	worktree, err := gs.repository.Worktree()
	if err != nil {
		log.Printf("[GitService] Worktree corrupted, attempting to reopen repository...")
		repo, err := git.PlainOpen(gs.dataDir)
		if err != nil {
			log.Printf("[GitService] Failed to reopen repository: %v, reinitializing...", err)
			gs.repository = nil
			if err := gs.initializeRepository(); err != nil {
				log.Printf("[GitService] ERROR: Failed to reinitialize repository: %v", err)
				return fmt.Errorf("failed to reinitialize repository: %w", err)
			}
			log.Printf("[GitService] Repository reinitialized after worktree corruption")
			return nil
		}
		gs.repository = repo
		log.Printf("[GitService] Repository reopened successfully")
		worktree, err = gs.repository.Worktree()
		if err != nil {
			log.Printf("[GitService] ERROR: Failed to get worktree after reopening: %v", err)
			return fmt.Errorf("failed to get worktree after reopening: %w", err)
		}
	}

	_, err = worktree.Status()
	if err != nil {
		log.Printf("[GitService] Repository status check failed: %v, attempting recovery...", err)
		gs.repository = nil
		if err := gs.initializeRepository(); err != nil {
			log.Printf("[GitService] ERROR: Failed to reinitialize repository: %v", err)
			return fmt.Errorf("failed to reinitialize repository after status failure: %w", err)
		}
		log.Printf("[GitService] Repository reinitialized after status check failure")
		return nil
	}

	log.Printf("[GitService] Repository repair completed successfully")
	return nil
}

func (gs *GitService) CommitDocument(documentPath string, message string) error {
	if gs.repository == nil {
		return fmt.Errorf("git repository not initialized")
	}

	worktree, err := gs.repository.Worktree()
	if err != nil {
		return fmt.Errorf("failed to get worktree: %w", err)
	}

	filePath := gs.getRelativeFilePath(documentPath)

	if _, err := worktree.Add(filePath); err != nil {
		return fmt.Errorf("failed to add file to staging: %w", err)
	}

	signature := &object.Signature{
		Name:  "Schist User",
		Email: "user@schist.local",
		When:  time.Now(),
	}

	if message == "" {
		message = fmt.Sprintf("Update document: %s", documentPath)
	}

	_, err = worktree.Commit(message, &git.CommitOptions{
		Author: signature,
	})
	if err != nil {
		return fmt.Errorf("failed to commit changes: %w", err)
	}

	return nil
}

func (gs *GitService) GetDocumentVersions(documentPath string) ([]*DocumentVersion, error) {
	if gs.repository == nil {
		return nil, fmt.Errorf("git repository not initialized")
	}

	filePath := gs.getRelativeFilePath(documentPath)

	// Check if the document file exists in the filesystem first
	fullPath := filepath.Join(gs.dataDir, filePath)
	if _, err := os.Stat(fullPath); os.IsNotExist(err) {
		// Document doesn't exist, return empty versions (not an error)
		return []*DocumentVersion{}, nil
	}

	logOptions := &git.LogOptions{
		FileName: &filePath,
	}

	commitIter, err := gs.repository.Log(logOptions)
	if err != nil {
		// If there are no commits yet, return empty versions (not an error)
		return []*DocumentVersion{}, nil
	}
	defer commitIter.Close()

	var versions []*DocumentVersion
	err = commitIter.ForEach(func(commit *object.Commit) error {
		tree, err := commit.Tree()
		if err != nil {
			return err
		}

		_, err = tree.File(filePath)
		if err != nil {
			// File doesn't exist in this commit, skip
			return nil
		}

		version := &DocumentVersion{
			Hash:      commit.Hash.String(),
			Message:   commit.Message,
			Author:    commit.Author.Name,
			Timestamp: commit.Author.When,
			FilePath:  documentPath,
		}
		versions = append(versions, version)
		return nil
	})

	if err != nil {
		return nil, fmt.Errorf("failed to iterate through commits: %w", err)
	}

	return versions, nil
}

func (gs *GitService) GetDocumentAtVersion(documentPath string, commitHash string) (*models.Document, error) {
	if gs.repository == nil {
		return nil, fmt.Errorf("git repository not initialized")
	}

	hash := plumbing.NewHash(commitHash)
	commit, err := gs.repository.CommitObject(hash)
	if err != nil {
		return nil, fmt.Errorf("failed to get commit object: %w", err)
	}

	tree, err := commit.Tree()
	if err != nil {
		return nil, fmt.Errorf("failed to get commit tree: %w", err)
	}

	filePath := gs.getRelativeFilePath(documentPath)

	file, err := tree.File(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to get file from tree: %w", err)
	}

	content, err := file.Contents()
	if err != nil {
		return nil, fmt.Errorf("failed to read file content: %w", err)
	}

	document, err := serializer.DeserializeDocument([]byte(content))
	if err != nil {
		return nil, fmt.Errorf("failed to deserialize document: %w", err)
	}

	return document, nil
}

func (gs *GitService) getRelativeFilePath(documentPath string) string {
	cleanPath := strings.TrimPrefix(documentPath, "/")
	if cleanPath == "" {
		cleanPath = "index"
	}
	return cleanPath + ".md"
}

// CompareVersions compares two versions of a document and returns a structured diff
func (gs *GitService) CompareVersions(documentPath, hash1, hash2 string) (*DiffResult, error) {
	if gs.repository == nil {
		return nil, fmt.Errorf("git repository not initialized")
	}

	// Validate that both commit hashes exist before attempting comparison
	if err := gs.validateCommitHashEsists(hash1); err != nil {
		return nil, fmt.Errorf("invalid hash1 %s: %w", hash1, err)
	}
	if err := gs.validateCommitHashEsists(hash2); err != nil {
		return nil, fmt.Errorf("invalid hash2 %s: %w", hash2, err)
	}

	content1, err := gs.getDocumentContent(documentPath, hash1)
	if err != nil {
		return nil, fmt.Errorf("failed to get content for hash1 %s: %w", hash1, err)
	}

	content2, err := gs.getDocumentContent(documentPath, hash2)
	if err != nil {
		return nil, fmt.Errorf("failed to get content for hash2 %s: %w", hash2, err)
	}

	return gs.computeDiff(documentPath, hash1, hash2, content1, content2), nil
}

// getDocumentContent retrieves the content of a document at a specific commit
func (gs *GitService) getDocumentContent(documentPath, commitHash string) (string, error) {
	hash := plumbing.NewHash(commitHash)
	commit, err := gs.repository.CommitObject(hash)
	if err != nil {
		return "", fmt.Errorf("failed to get commit object: %w", err)
	}

	tree, err := commit.Tree()
	if err != nil {
		return "", fmt.Errorf("failed to get commit tree: %w", err)
	}

	filePath := gs.getRelativeFilePath(documentPath)
	file, err := tree.File(filePath)
	if err != nil {
		return "", fmt.Errorf("failed to get file from tree: %w", err)
	}

	content, err := file.Contents()
	if err != nil {
		return "", fmt.Errorf("failed to read file content: %w", err)
	}

	return content, nil
}

func (gs *GitService) validateCommitHashEsists(commitHash string) error {
	hash := plumbing.NewHash(commitHash)
	_, err := gs.repository.CommitObject(hash)
	if err != nil {
		return fmt.Errorf("commit does not exist in repository")
	}
	return nil
}

func (gs *GitService) computeDiff(documentPath, hash1, hash2, content1, content2 string) *DiffResult {
	dmp := diffmatchpatch.New()
	diffs := dmp.DiffMain(content1, content2, false)
	diffs = dmp.DiffCleanupSemantic(diffs)

	var lines []DiffLine
	var summary DiffSummary

	oldLineNum := 1
	newLineNum := 1
	lineNum := 1

	for _, diff := range diffs {
		diffLines := strings.Split(diff.Text, "\n")
		if len(diffLines) > 0 && diffLines[len(diffLines)-1] == "" {
			diffLines = diffLines[:len(diffLines)-1] // Remove empty line at end
		}

		switch diff.Type {
		case diffmatchpatch.DiffDelete:
			for i, line := range diffLines {
				if i == len(diffLines)-1 && line == "" {
					continue
				}
				lines = append(lines, DiffLine{
					Type:       ChangeTypeDeletion,
					LineNumber: lineNum,
					Content:    line,
					OldLine:    oldLineNum,
				})
				oldLineNum++
				lineNum++
				summary.Deletions++
			}
		case diffmatchpatch.DiffInsert:
			for i, line := range diffLines {
				if i == len(diffLines)-1 && line == "" {
					continue
				}
				lines = append(lines, DiffLine{
					Type:       ChangeTypeAddition,
					LineNumber: lineNum,
					Content:    line,
					NewLine:    newLineNum,
				})
				newLineNum++
				lineNum++
				summary.Additions++
			}
		case diffmatchpatch.DiffEqual:
			for i, line := range diffLines {
				if i == len(diffLines)-1 && line == "" {
					continue
				}
				lines = append(lines, DiffLine{
					Type:       ChangeTypeContext,
					LineNumber: lineNum,
					Content:    line,
					OldLine:    oldLineNum,
					NewLine:    newLineNum,
				})
				oldLineNum++
				newLineNum++
				lineNum++
			}
		}
	}

	return &DiffResult{
		DocumentPath: documentPath,
		Hash1:        hash1,
		Hash2:        hash2,
		Lines:        lines,
		Summary:      summary,
	}
}

func (gs *GitService) RestoreDocument(documentPath, commitHash string) error {
	if gs.repository == nil {
		return fmt.Errorf("git repository not initialized")
	}

	content, err := gs.getDocumentContent(documentPath, commitHash)
	if err != nil {
		return fmt.Errorf("failed to get document content from commit %s: %w", commitHash, err)
	}

	hash := plumbing.NewHash(commitHash)
	commit, err := gs.repository.CommitObject(hash)
	if err != nil {
		return fmt.Errorf("failed to get commit object for message: %w", err)
	}

	filePath := gs.getRelativeFilePath(documentPath)
	fullPath := filepath.Join(gs.dataDir, filePath)

	dir := filepath.Dir(fullPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create directory: %w", err)
	}

	if err := os.WriteFile(fullPath, []byte(content), 0644); err != nil {
		return fmt.Errorf("failed to write restored content: %w", err)
	}

	shortHash := commitHash
	if len(shortHash) > 7 {
		shortHash = shortHash[:7]
	}

	originalMessage := strings.TrimSpace(commit.Message)
	restoreMessage := fmt.Sprintf("Restore document to version %s: %s", shortHash, originalMessage)

	if err := gs.CommitDocument(documentPath, restoreMessage); err != nil {
		return fmt.Errorf("failed to commit restored document: %w", err)
	}

	return nil
}
