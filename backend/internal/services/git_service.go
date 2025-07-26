package services

import (
	"fmt"
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

// ChangeType represents the type of change in a diff line
type ChangeType string

const (
	ChangeTypeAddition     ChangeType = "addition"
	ChangeTypeDeletion     ChangeType = "deletion"
	ChangeTypeModification ChangeType = "modification"
	ChangeTypeContext      ChangeType = "context"
)

// DiffLine represents a single line change in a document diff
type DiffLine struct {
	Type       ChangeType `json:"type"`
	LineNumber int        `json:"line_number"`
	Content    string     `json:"content"`
	OldLine    int        `json:"old_line,omitempty"`
	NewLine    int        `json:"new_line,omitempty"`
}

// DiffResult represents the result of comparing two versions of a document
type DiffResult struct {
	DocumentPath string      `json:"document_path"`
	Hash1        string      `json:"hash1"`
	Hash2        string      `json:"hash2"`
	Lines        []DiffLine  `json:"lines"`
	Summary      DiffSummary `json:"summary"`
}

// DiffSummary provides statistics about the diff
type DiffSummary struct {
	Additions     int `json:"additions"`
	Deletions     int `json:"deletions"`
	Modifications int `json:"modifications"`
}

func NewGitService(dataDir string) (*GitService, error) {
	gs := &GitService{
		dataDir: dataDir,
	}

	if err := gs.initializeRepository(); err != nil {
		return nil, fmt.Errorf("failed to initialize git repository: %w", err)
	}

	return gs, nil
}

func (gs *GitService) initializeRepository() error {
	gitDir := filepath.Join(gs.dataDir, ".git")

	// Check if git repository already exists
	if _, err := os.Stat(gitDir); err == nil {
		// Repository exists, open it
		repo, err := git.PlainOpen(gs.dataDir)
		if err != nil {
			return fmt.Errorf("failed to open existing repository: %w", err)
		}
		gs.repository = repo
		return nil
	}

	// Initialize new repository
	repo, err := git.PlainInit(gs.dataDir, false)
	if err != nil {
		return fmt.Errorf("failed to initialize git repository: %w", err)
	}

	gs.repository = repo

	// Create initial commit if repository is empty
	if err := gs.createInitialCommit(); err != nil {
		return fmt.Errorf("failed to create initial commit: %w", err)
	}

	return nil
}

func (gs *GitService) createInitialCommit() error {
	worktree, err := gs.repository.Worktree()
	if err != nil {
		return fmt.Errorf("failed to get worktree: %w", err)
	}

	// Create .gitignore if it doesn't exist
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

	// Add .gitignore to staging
	if _, err := worktree.Add(".gitignore"); err != nil {
		return fmt.Errorf("failed to add .gitignore: %w", err)
	}

	// Create initial commit
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

func (gs *GitService) CommitDocument(documentPath string, message string) error {
	if gs.repository == nil {
		return fmt.Errorf("git repository not initialized")
	}

	worktree, err := gs.repository.Worktree()
	if err != nil {
		return fmt.Errorf("failed to get worktree: %w", err)
	}

	// Convert logical path to file path
	filePath := gs.getRelativeFilePath(documentPath)

	// Add file to staging area
	if _, err := worktree.Add(filePath); err != nil {
		return fmt.Errorf("failed to add file to staging: %w", err)
	}

	// Create commit
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

	// Get commit history for the specific file
	logOptions := &git.LogOptions{
		FileName: &filePath,
	}

	commitIter, err := gs.repository.Log(logOptions)
	if err != nil {
		return nil, fmt.Errorf("failed to get commit history: %w", err)
	}
	defer commitIter.Close()

	var versions []*DocumentVersion
	err = commitIter.ForEach(func(commit *object.Commit) error {
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

func (gs *GitService) GetDocumentAtVersion(documentPath string, commitHash string) (*models.Page, error) {
	if gs.repository == nil {
		return nil, fmt.Errorf("git repository not initialized")
	}

	// Parse commit hash
	hash := plumbing.NewHash(commitHash)
	commit, err := gs.repository.CommitObject(hash)
	if err != nil {
		return nil, fmt.Errorf("failed to get commit object: %w", err)
	}

	// Get file tree from commit
	tree, err := commit.Tree()
	if err != nil {
		return nil, fmt.Errorf("failed to get commit tree: %w", err)
	}

	filePath := gs.getRelativeFilePath(documentPath)

	// Get file from tree
	file, err := tree.File(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to get file from tree: %w", err)
	}

	// Read file content
	content, err := file.Contents()
	if err != nil {
		return nil, fmt.Errorf("failed to read file content: %w", err)
	}

	// Deserialize page from content using the existing serializer
	page, err := serializer.DeserializePage([]byte(content))
	if err != nil {
		return nil, fmt.Errorf("failed to deserialize page: %w", err)
	}

	return page, nil
}

func (gs *GitService) getRelativeFilePath(documentPath string) string {
	// Convert logical path like "/folder/page" to file path "folder/page.md"
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

// computeDiff computes the line-by-line diff between two document contents
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
					continue // Skip final empty line
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
					continue // Skip final empty line
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
					continue // Skip final empty line
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

// RestoreDocument restores a document to a previous version and creates a new commit
func (gs *GitService) RestoreDocument(documentPath, commitHash string) error {
	if gs.repository == nil {
		return fmt.Errorf("git repository not initialized")
	}

	// Get the content from the specified commit
	content, err := gs.getDocumentContent(documentPath, commitHash)
	if err != nil {
		return fmt.Errorf("failed to get document content from commit %s: %w", commitHash, err)
	}

	// Get commit info for meaningful commit message
	hash := plumbing.NewHash(commitHash)
	commit, err := gs.repository.CommitObject(hash)
	if err != nil {
		return fmt.Errorf("failed to get commit object for message: %w", err)
	}

	// Write content to current file system
	filePath := gs.getRelativeFilePath(documentPath)
	fullPath := filepath.Join(gs.dataDir, filePath)

	// Create directory if needed
	dir := filepath.Dir(fullPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create directory: %w", err)
	}

	// Write the restored content
	if err := os.WriteFile(fullPath, []byte(content), 0644); err != nil {
		return fmt.Errorf("failed to write restored content: %w", err)
	}

	// Create commit with meaningful message
	shortHash := commitHash
	if len(shortHash) > 7 {
		shortHash = shortHash[:7]
	}

	originalMessage := strings.TrimSpace(commit.Message)
	restoreMessage := fmt.Sprintf("Restore document to version %s: %s", shortHash, originalMessage)

	// Commit the restoration
	if err := gs.CommitDocument(documentPath, restoreMessage); err != nil {
		return fmt.Errorf("failed to commit restored document: %w", err)
	}

	return nil
}
