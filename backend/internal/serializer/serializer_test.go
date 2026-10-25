package serializer

import (
	"testing"
	"time"

	"github.com/MorrisMorrison/schist/internal/models"
)

func TestSerializeDeserialize_RoundTripPreservesContent(t *testing.T) {
	tests := []struct {
		name    string
		content string
	}{
		{name: "plain content", content: "hello"},
		{name: "empty content", content: ""},
		{name: "content starting with heading", content: "# Title\n\nbody\n"},
		{name: "content with horizontal rule", content: "a\n---\nb"},
		{name: "content with intentional leading blank line", content: "\nindented start"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			doc := &models.Document{
				MetaData: &models.DocumentMetaData{
					Title:   "T",
					Path:    "/t",
					Created: time.Date(2024, 1, 2, 3, 4, 5, 0, time.UTC),
				},
				Content: tt.content,
			}

			// Several save/load cycles must not change the content (a leading
			// newline used to be added on every cycle).
			current := doc
			for i := 0; i < 3; i++ {
				data, err := SerializeDocument(current)
				if err != nil {
					t.Fatalf("SerializeDocument() error = %v", err)
				}
				current, err = DeserializeDocument(data)
				if err != nil {
					t.Fatalf("DeserializeDocument() error = %v", err)
				}
			}

			if current.Content != tt.content {
				t.Errorf("content after round trips = %q, want %q", current.Content, tt.content)
			}
			if current.MetaData.Title != "T" || current.MetaData.Path != "/t" {
				t.Errorf("metadata not preserved: %+v", current.MetaData)
			}
		})
	}
}

func TestDeserializeDocument_Formats(t *testing.T) {
	tests := []struct {
		name        string
		input       string
		wantErr     bool
		wantTitle   string
		wantContent string
	}{
		{
			name:        "file written by SerializeDocument",
			input:       "---\ntitle: A\npath: /a\n---\n\nbody",
			wantTitle:   "A",
			wantContent: "body",
		},
		{
			name:        "hand-written file without blank separator line",
			input:       "---\ntitle: A\npath: /a\n---\nbody",
			wantTitle:   "A",
			wantContent: "body",
		},
		{
			name:        "CRLF line endings",
			input:       "---\r\ntitle: A\r\npath: /a\r\n---\r\n\r\nbody\r\nline2",
			wantTitle:   "A",
			wantContent: "body\r\nline2",
		},
		{name: "missing front matter", input: "just text", wantErr: true},
		{name: "unterminated front matter", input: "---\ntitle: A\n", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			doc, err := DeserializeDocument([]byte(tt.input))
			if tt.wantErr {
				if err == nil {
					t.Fatal("expected an error")
				}
				return
			}
			if err != nil {
				t.Fatalf("DeserializeDocument() error = %v", err)
			}
			if doc.MetaData.Title != tt.wantTitle {
				t.Errorf("title = %q, want %q", doc.MetaData.Title, tt.wantTitle)
			}
			if doc.Content != tt.wantContent {
				t.Errorf("content = %q, want %q", doc.Content, tt.wantContent)
			}
		})
	}
}
