package services

import (
	"os"
	"testing"
	"time"

	"github.com/MorrisMorrison/schist/internal/models"
)

func TestLinkService_ParseWikiLinks(t *testing.T) {
	tests := []struct {
		name     string
		content  string
		expected []*WikiLink
	}{
		{
			name:     "no wiki links",
			content:  "This is regular text with [regular](link) and no wiki links.",
			expected: []*WikiLink{},
		},
		{
			name:    "simple wiki link",
			content: "Check out [[Test Page]] for more info.",
			expected: []*WikiLink{
				{
					Target:      "Test Page",
					DisplayText: "Test Page",
					Path:        "/test-page",
					IsValid:     false, // Assuming page doesn't exist in test
				},
			},
		},
		{
			name:    "wiki link with display text",
			content: "See [[Project Ideas|my ideas]] here.",
			expected: []*WikiLink{
				{
					Target:      "Project Ideas",
					DisplayText: "my ideas",
					Path:        "/project-ideas",
					IsValid:     false,
				},
			},
		},
		{
			name:    "multiple wiki links",
			content: "Links to [[Page One]] and [[Page Two|second page]] exist.",
			expected: []*WikiLink{
				{
					Target:      "Page One",
					DisplayText: "Page One",
					Path:        "/page-one",
					IsValid:     false,
				},
				{
					Target:      "Page Two",
					DisplayText: "second page",
					Path:        "/page-two",
					IsValid:     false,
				},
			},
		},
		{
			name:    "wiki links with special characters",
			content: "Reference [[API & Design]] and [[Test-Page_2]].",
			expected: []*WikiLink{
				{
					Target:      "API & Design",
					DisplayText: "API & Design",
					Path:        "/api-design",
					IsValid:     false,
				},
				{
					Target:      "Test-Page_2",
					DisplayText: "Test-Page_2",
					Path:        "/test-page_2",
					IsValid:     false,
				},
			},
		},
		{
			name:     "empty and whitespace links",
			content:  "Invalid links: [[]] and [[   ]] should be ignored.",
			expected: []*WikiLink{},
		},
	}

	// Create temporary directory for test
	tempDir, err := os.MkdirTemp("", "link_service_test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	documentService := NewDocumentService(tempDir)
	linkService := NewLinkService(documentService)

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			links := linkService.ParseWikiLinks(tt.content)

			if len(links) != len(tt.expected) {
				t.Errorf("Expected %d links, got %d", len(tt.expected), len(links))
				return
			}

			for i, link := range links {
				expected := tt.expected[i]
				if link.Target != expected.Target {
					t.Errorf("Link %d: expected target %q, got %q", i, expected.Target, link.Target)
				}
				if link.DisplayText != expected.DisplayText {
					t.Errorf("Link %d: expected display text %q, got %q", i, expected.DisplayText, link.DisplayText)
				}
				if link.Path != expected.Path {
					t.Errorf("Link %d: expected path %q, got %q", i, expected.Path, link.Path)
				}
			}
		})
	}
}

func TestLinkService_ResolveTargetToPath(t *testing.T) {
	// Create temporary directory for test
	tempDir, err := os.MkdirTemp("", "link_service_test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	documentService := NewDocumentService(tempDir)
	linkService := NewLinkService(documentService)

	// Create a test page
	testDocument := &models.Document{
		MetaData: &models.DocumentMetaData{
			Title:   "Test Page",
			Path:    "/test-page",
			Slug:    "test-page",
			Created: time.Now(),
			Updated: time.Now(),
		},
		Content: "Test content",
	}

	err = documentService.CreateDocument(testDocument)
	if err != nil {
		t.Fatalf("Failed to create test page: %v", err)
	}

	tests := []struct {
		name     string
		target   string
		expected string
	}{
		{
			name:     "exact title match",
			target:   "Test Page",
			expected: "/test-page",
		},
		{
			name:     "case insensitive match",
			target:   "test page",
			expected: "/test-page",
		},
		{
			name:     "no match - generates slug",
			target:   "Nonexistent Page",
			expected: "/nonexistent-page",
		},
		{
			name:     "special characters in target",
			target:   "API & Design",
			expected: "/api-design",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			path := linkService.resolveTargetToPath(tt.target)
			if path != tt.expected {
				t.Errorf("Expected path %q, got %q", tt.expected, path)
			}
		})
	}
}

func TestLinkService_BacklinksManagement(t *testing.T) {
	// Create temporary directory for test
	tempDir, err := os.MkdirTemp("", "link_service_test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	documentService := NewDocumentService(tempDir)
	linkService := NewLinkService(documentService)

	// Create test pages
	targetDocument := &models.Document{
		MetaData: &models.DocumentMetaData{
			Title:   "Target Page",
			Path:    "/target",
			Slug:    "target",
			Created: time.Now(),
			Updated: time.Now(),
		},
		Content: "This is the target page.",
	}

	sourceDocument1 := &models.Document{
		MetaData: &models.DocumentMetaData{
			Title:   "Source One",
			Path:    "/source-one",
			Slug:    "source-one",
			Created: time.Now(),
			Updated: time.Now(),
		},
		Content: "This links to [[Target Page]] for reference.",
	}

	sourceDocument2 := &models.Document{
		MetaData: &models.DocumentMetaData{
			Title:   "Source Two",
			Path:    "/source-two",
			Slug:    "source-two",
			Created: time.Now(),
			Updated: time.Now(),
		},
		Content: "Also references [[Target Page|the target]] here.",
	}

	// Create pages
	if err := documentService.CreateDocument(targetDocument); err != nil {
		t.Fatalf("Failed to create target page: %v", err)
	}
	if err := documentService.CreateDocument(sourceDocument1); err != nil {
		t.Fatalf("Failed to create source page 1: %v", err)
	}
	if err := documentService.CreateDocument(sourceDocument2); err != nil {
		t.Fatalf("Failed to create source page 2: %v", err)
	}

	// Test updating backlinks
	err = linkService.UpdateBacklinks("/source-one")
	if err != nil {
		t.Fatalf("Failed to update backlinks: %v", err)
	}

	err = linkService.UpdateBacklinks("/source-two")
	if err != nil {
		t.Fatalf("Failed to update backlinks: %v", err)
	}

	// Test getting backlinks
	backlinks, err := linkService.GetBacklinks("/target")
	if err != nil {
		t.Fatalf("Failed to get backlinks: %v", err)
	}

	expectedBacklinks := []string{"/source-one", "/source-two"}
	if len(backlinks) != len(expectedBacklinks) {
		t.Errorf("Expected %d backlinks, got %d", len(expectedBacklinks), len(backlinks))
	}

	// Check if all expected backlinks are present
	backlinkMap := make(map[string]bool)
	for _, bl := range backlinks {
		backlinkMap[bl] = true
	}

	for _, expected := range expectedBacklinks {
		if !backlinkMap[expected] {
			t.Errorf("Expected backlink %q not found", expected)
		}
	}

	// Test getting outgoing links
	outgoingLinks, err := linkService.GetOutgoingLinks("/source-one")
	if err != nil {
		t.Fatalf("Failed to get outgoing links: %v", err)
	}

	if len(outgoingLinks) != 1 {
		t.Errorf("Expected 1 outgoing link, got %d", len(outgoingLinks))
	} else {
		link := outgoingLinks[0]
		if link.Target != "Target Page" {
			t.Errorf("Expected target 'Target Page', got %q", link.Target)
		}
		if !link.IsValid {
			t.Errorf("Expected link to be valid")
		}
	}
}

func TestLinkService_GetBrokenLinks(t *testing.T) {
	// Create temporary directory for test
	tempDir, err := os.MkdirTemp("", "link_service_test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	documentService := NewDocumentService(tempDir)
	linkService := NewLinkService(documentService)

	// Create a page with broken links
	documentWithBrokenLinks := &models.Document{
		MetaData: &models.DocumentMetaData{
			Title:   "Page With Broken Links",
			Path:    "/broken-links",
			Slug:    "broken-links",
			Created: time.Now(),
			Updated: time.Now(),
		},
		Content: "Links to [[Nonexistent Page]] and [[Another Missing Page|missing]].",
	}

	if err := documentService.CreateDocument(documentWithBrokenLinks); err != nil {
		t.Fatalf("Failed to create test page: %v", err)
	}

	// Get broken links
	brokenLinks, err := linkService.GetBrokenLinks()
	if err != nil {
		t.Fatalf("Failed to get broken links: %v", err)
	}

	// Should have one page with broken links
	if len(brokenLinks) != 1 {
		t.Errorf("Expected 1 page with broken links, got %d", len(brokenLinks))
	}

	pageLinks, exists := brokenLinks["/broken-links"]
	if !exists {
		t.Fatalf("Expected broken links for /broken-links")
	}

	if len(pageLinks) != 2 {
		t.Errorf("Expected 2 broken links, got %d", len(pageLinks))
	}

	// Check the broken links
	expectedTargets := []string{"Nonexistent Page", "Another Missing Page"}
	for i, link := range pageLinks {
		if link.Target != expectedTargets[i] {
			t.Errorf("Expected broken link target %q, got %q", expectedTargets[i], link.Target)
		}
		if link.IsValid {
			t.Errorf("Expected link to be invalid")
		}
	}
}
