package mcpserver

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"log"
	"path"
	"path/filepath"
	"strings"
	"time"

	apierrors "github.com/MorrisMorrison/schist/internal/errors"
	"github.com/MorrisMorrison/schist/internal/utils"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// trashFolder is where deleted pages and folders go. It is hidden from
// folders, search and links, and nothing in it is ever removed over MCP, so a
// delete can always be undone with a move.
const trashFolder = "/trash"

func (t *tools) registerManage(s *mcp.Server) {
	notDestructive := false
	destructive := true
	mcp.AddTool(s, &mcp.Tool{
		Name: "move_document",
		Description: "Move or rename a page to a new path. Fails if a page already exists there. " +
			"[[Wiki links]] point at titles, so links to the page keep working. The move is committed to git.",
		Annotations: &mcp.ToolAnnotations{DestructiveHint: &notDestructive},
	}, t.moveDocument)
	mcp.AddTool(s, &mcp.Tool{
		Name: "move_folder",
		Description: "Move or rename a folder with everything in it. Fails if the target exists, or when moving a " +
			"folder into itself. The move is committed to git.",
		Annotations: &mcp.ToolAnnotations{DestructiveHint: &notDestructive},
	}, t.moveFolder)
	mcp.AddTool(s, &mcp.Tool{
		Name: "delete_document",
		Description: "Destructive: delete a page by moving it to the trash (/trash/<path>). It disappears from " +
			"folders, search and links, and links to it break; the result lists the pages that linked to it. " +
			"Undo with move_document from the trash path. Committed to git.",
		Annotations: &mcp.ToolAnnotations{DestructiveHint: &destructive},
	}, t.deleteDocument)
	mcp.AddTool(s, &mcp.Tool{
		Name: "delete_folder",
		Description: "Destructive: delete a folder and every page in it by moving it to the trash " +
			"(/trash/<path>). Undo with move_folder from the trash path. Committed to git.",
		Annotations: &mcp.ToolAnnotations{DestructiveHint: &destructive},
	}, t.deleteFolder)
}

type moveIn struct {
	Path    string `json:"path" jsonschema:"current path"`
	NewPath string `json:"new_path" jsonschema:"new path, e.g. /archive/old-plan"`
}

type moveOut struct {
	From      string `json:"from"`
	To        string `json:"to"`
	Documents int    `json:"documents,omitempty" jsonschema:"pages moved with the folder"`
	Message   string `json:"message"`
}

func (t *tools) moveDocument(_ context.Context, _ *mcp.CallToolRequest, in moveIn) (*mcp.CallToolResult, moveOut, error) {
	from, to := documentPath(in.Path), documentPath(in.NewPath)
	if to == "/" {
		return nil, moveOut{}, errors.New("new_path is required, e.g. /archive/my-page")
	}
	if from == to {
		return nil, moveOut{}, errors.New("new_path is the same as path")
	}
	if err := t.svc.DocumentService.MoveDocument(from, to); err != nil {
		return nil, moveOut{}, toolError(err)
	}
	t.refreshLinks(to)
	return nil, moveOut{From: from, To: to, Message: fmt.Sprintf("Moved %s to %s", from, to)}, nil
}

func (t *tools) moveFolder(_ context.Context, _ *mcp.CallToolRequest, in moveIn) (*mcp.CallToolResult, moveOut, error) {
	from, to := folderPath(in.Path), folderPath(in.NewPath)
	if from == to {
		return nil, moveOut{}, errors.New("new_path is the same as path")
	}
	moved, err := t.relocateFolder(from, to)
	if err != nil {
		return nil, moveOut{}, err
	}
	return nil, moveOut{
		From: from, To: to, Documents: moved,
		Message: fmt.Sprintf("Moved folder %s to %s (%s)", from, to, plural(moved, "page", "pages")),
	}, nil
}

// relocateFolder moves a folder and commits every page in it at both paths,
// so git records the move. The folder services leave committing to the
// caller. It returns the number of pages moved.
func (t *tools) relocateFolder(from, to string) (int, error) {
	pages, err := t.pagesUnder(from)
	if err != nil {
		return 0, toolError(err)
	}

	docs := t.svc.DocumentService
	if path.Dir(from) == path.Dir(to) {
		err = docs.RenameFolder(from, path.Base(to))
	} else {
		err = docs.MoveFolder(from, to)
	}
	if err != nil {
		return 0, toolError(err)
	}

	// The folder services rewrite each page's stored path from the document
	// listing, which skips the trash, so pages moved into or out of it keep
	// their old path. Fix those here; the commit below records them.
	moved := make([]string, 0, len(pages))
	for _, p := range pages {
		newPath := to + strings.TrimPrefix(p, from)
		moved = append(moved, newPath)
		doc, err := docs.GetDocumentByPath(newPath)
		if err != nil || doc.MetaData.Path == newPath {
			continue
		}
		doc.MetaData.Path = newPath
		doc.MetaData.Slug = utils.ExtractSlugFromPath(newPath)
		if err := docs.UpdateDocumentWithSaveType(doc, "auto"); err != nil {
			log.Printf("[MCP] failed to update the path stored in %s: %v", newPath, err)
		}
	}

	if len(pages) > 0 && t.svc.GitService != nil {
		paths := make([]string, 0, 2*len(pages))
		for i, p := range pages {
			paths = append(paths, p, moved[i])
		}
		if err := t.svc.GitService.CommitDocuments(fmt.Sprintf("Move folder: %s -> %s", from, to), paths...); err != nil {
			log.Printf("[MCP] moved %s to %s but the commit failed: %v", from, to, err)
			return 0, errors.New("the folder was moved, but committing it to git failed; see the Schist server log")
		}
	}
	if !strings.HasPrefix(to+"/", trashFolder+"/") {
		if err := t.svc.LinkService.UpdateBacklinksFor(moved...); err != nil {
			log.Printf("[MCP] failed to update backlinks after moving %s: %v", from, err)
		}
	}
	return len(pages), nil
}

// pagesUnder lists the pages inside a folder at any depth, from the files on
// disk, so it works inside the trash too (the document listing skips it).
func (t *tools) pagesUnder(folder string) ([]string, error) {
	if _, err := t.svc.DocumentService.GetFolder(folder); err != nil {
		return nil, err
	}
	dataDir := t.svc.Config.DataDir
	var pages []string
	err := filepath.WalkDir(utils.BuildFilePath(dataDir, folder), func(file string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() || !strings.HasSuffix(entry.Name(), ".md") {
			return err
		}
		rel, err := filepath.Rel(dataDir, file)
		if err != nil {
			return err
		}
		pages = append(pages, "/"+strings.TrimSuffix(filepath.ToSlash(rel), ".md"))
		return nil
	})
	return pages, err
}

type deleteIn struct {
	Path string `json:"path"`
}

type deleteOut struct {
	Path       string   `json:"path"`
	TrashPath  string   `json:"trashPath" jsonschema:"where it is now; move it back from here to undo"`
	Documents  int      `json:"documents,omitempty" jsonschema:"pages deleted with the folder"`
	LinkedFrom []string `json:"linkedFrom,omitempty" jsonschema:"pages whose [[links]] to the deleted page now break"`
	Message    string   `json:"message"`
}

func (t *tools) deleteDocument(_ context.Context, _ *mcp.CallToolRequest, in deleteIn) (*mcp.CallToolResult, deleteOut, error) {
	p := documentPath(in.Path)
	if inTrash(p) {
		return nil, deleteOut{}, errors.New("this page is already in the trash; pages are never removed for good over MCP")
	}
	if _, err := t.svc.DocumentService.GetDocumentByPath(p); err != nil {
		return nil, deleteOut{}, toolError(err)
	}
	linkedFrom, err := t.svc.LinkService.GetBacklinks(p)
	if err != nil {
		log.Printf("[MCP] failed to read backlinks of %s: %v", p, err)
	}

	trashPath := trashFolder + p
	docs := t.svc.DocumentService
	err = docs.MoveDocument(p, trashPath)
	if apierrors.HasCode(err, apierrors.ErrCodeAlreadyExists) {
		// An older copy with the same path is in the trash: the newer one
		// replaces it, as in the web app. The older copy stays in git history.
		if err = docs.DeleteDocument(trashPath); err == nil {
			err = docs.MoveDocument(p, trashPath)
		}
	}
	if err != nil {
		return nil, deleteOut{}, toolError(err)
	}

	msg := fmt.Sprintf("Moved %s to the trash at %s; undo with move_document from there", p, trashPath)
	if len(linkedFrom) > 0 {
		msg += fmt.Sprintf(". Links to it from %s now break", plural(len(linkedFrom), "page", "pages"))
	}
	return nil, deleteOut{Path: p, TrashPath: trashPath, LinkedFrom: linkedFrom, Message: msg}, nil
}

func (t *tools) deleteFolder(_ context.Context, _ *mcp.CallToolRequest, in deleteIn) (*mcp.CallToolResult, deleteOut, error) {
	p := folderPath(in.Path)
	switch {
	case p == "/":
		return nil, deleteOut{}, errors.New("cannot delete the root folder")
	case p == trashFolder || inTrash(p):
		return nil, deleteOut{}, errors.New("this folder is the trash or in it; nothing is removed for good over MCP")
	}
	if _, err := t.svc.DocumentService.GetFolder(p); err != nil {
		return nil, deleteOut{}, toolError(err)
	}

	// Never merge into or replace an earlier deleted folder of the same path.
	trashPath := trashFolder + p
	if t.folderExists(trashPath) {
		stamp := time.Now().UTC().Format("20060102-150405")
		trashPath = fmt.Sprintf("%s%s-%s", trashFolder, p, stamp)
		for n := 2; t.folderExists(trashPath); n++ {
			trashPath = fmt.Sprintf("%s%s-%s-%d", trashFolder, p, stamp, n)
		}
	}

	moved, err := t.relocateFolder(p, trashPath)
	if err != nil {
		return nil, deleteOut{}, err
	}
	return nil, deleteOut{
		Path: p, TrashPath: trashPath, Documents: moved,
		Message: fmt.Sprintf("Moved folder %s (%s) to the trash at %s; undo with move_folder from there",
			p, plural(moved, "page", "pages"), trashPath),
	}, nil
}

func (t *tools) folderExists(p string) bool {
	_, err := t.svc.DocumentService.GetFolder(p)
	return err == nil
}

func inTrash(p string) bool {
	return strings.HasPrefix(p, trashFolder+"/")
}

// folderPath normalizes a folder path from a client.
func folderPath(p string) string {
	return utils.NormalizePath(utils.EnsureLeadingSlash(strings.TrimSpace(p)))
}
