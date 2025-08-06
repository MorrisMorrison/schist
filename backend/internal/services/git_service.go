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

	if _, err := os.Stat(gitDir); err == nil {
		repo, err := git.PlainOpen(gs.dataDir)
		if err != nil {
			return fmt.Errorf("failed to open existing repository: %w", err)
		}
		gs.repository = repo
		return nil
	}

	repo, err := git.PlainInit(gs.dataDir, false)
	if err != nil {
		return fmt.Errorf("failed to initialize git repository: %w", err)
	}

	gs.repository = repo

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
		tree, err := commit.Tree()
		if err != nil {
			return err
		}

		_, err = tree.File(filePath)
		if err != nil {
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
