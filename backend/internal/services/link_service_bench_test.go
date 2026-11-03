package services_test

import (
	"fmt"
	"math/rand"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/MorrisMorrison/schist/internal/models"
	"github.com/MorrisMorrison/schist/internal/serializer"
	"github.com/MorrisMorrison/schist/internal/services"
)

const benchWikiPages = 2000

// newBenchWiki writes a generated wiki of n pages straight to disk (no git
// commits, which would dominate the setup) and returns a link service over it.
// Pages sit in 20 folders, each links to five other pages and to one page
// that doesn't exist, and carries a few paragraphs of text.
func newBenchWiki(b *testing.B, n int) *services.LinkService {
	b.Helper()
	dir := b.TempDir()
	rng := rand.New(rand.NewSource(1))
	paragraph := strings.Repeat("Lorem ipsum dolor sit amet, consectetur adipiscing elit. ", 8)

	for i := 0; i < n; i++ {
		var body strings.Builder
		fmt.Fprintf(&body, "# Page %d\n\n", i)
		for p := 0; p < 4; p++ {
			body.WriteString(paragraph)
			fmt.Fprintf(&body, "See [[Page %d]].\n\n", rng.Intn(n))
		}
		fmt.Fprintf(&body, "Also [[Page %d|an alias]] and [[Missing %d]].\n", rng.Intn(n), i)

		path := fmt.Sprintf("/folder-%d/page-%d", i%20, i)
		raw, err := serializer.SerializeDocument(&models.Document{
			MetaData: &models.DocumentMetaData{
				Title: fmt.Sprintf("Page %d", i), Path: path, Slug: fmt.Sprintf("page-%d", i),
				Created: time.Unix(0, 0), Updated: time.Unix(0, 0),
			},
			Content: body.String(),
		})
		if err != nil {
			b.Fatal(err)
		}
		file := filepath.Join(dir, filepath.FromSlash(path)+".md")
		if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
			b.Fatal(err)
		}
		if err := os.WriteFile(file, raw, 0o644); err != nil {
			b.Fatal(err)
		}
	}

	ignore := services.NewIgnoreService(dir)
	return services.NewLinkService(services.NewDocumentService(dir, nil, ignore), ignore)
}

func BenchmarkLinkService_GetBacklinks(b *testing.B) {
	ls := newBenchWiki(b, benchWikiPages)
	if _, err := ls.GetBacklinks("/folder-7/page-7"); err != nil { // warm up
		b.Fatal(err)
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := ls.GetBacklinks(fmt.Sprintf("/folder-%d/page-%d", i%20, i%benchWikiPages)); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkLinkService_GetOutgoingLinks(b *testing.B) {
	ls := newBenchWiki(b, benchWikiPages)
	if _, err := ls.GetOutgoingLinks("/folder-7/page-7"); err != nil { // warm up
		b.Fatal(err)
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		page := i % benchWikiPages
		if _, err := ls.GetOutgoingLinks(fmt.Sprintf("/folder-%d/page-%d", page%20, page)); err != nil {
			b.Fatal(err)
		}
	}
}

// BenchmarkLinkService_PageView is what opening a page costs: its outgoing
// links plus its backlinks.
func BenchmarkLinkService_PageView(b *testing.B) {
	ls := newBenchWiki(b, benchWikiPages)
	if _, err := ls.GetBacklinks("/folder-7/page-7"); err != nil { // warm up
		b.Fatal(err)
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		page := i % benchWikiPages
		path := fmt.Sprintf("/folder-%d/page-%d", page%20, page)
		if _, err := ls.GetOutgoingLinks(path); err != nil {
			b.Fatal(err)
		}
		if _, err := ls.GetBacklinks(path); err != nil {
			b.Fatal(err)
		}
	}
}
