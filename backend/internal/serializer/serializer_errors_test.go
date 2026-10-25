package serializer

import (
	"strings"
	"testing"

	"github.com/MorrisMorrison/schist/internal/models"
)

func TestDeserializeDocument_Rejects(t *testing.T) {
	tests := map[string]string{
		"no front matter":        "# Just markdown\n",
		"unterminated":           "---\ntitle: x\n# no closing fence\n",
		"invalid yaml":           "---\ntitle: [unclosed\n---\nbody\n",
		"yaml of the wrong type": "---\ntags: {a: b}\n---\nbody\n",
		"empty":                  "",
	}
	for name, input := range tests {
		t.Run(name, func(t *testing.T) {
			if doc, err := DeserializeDocument([]byte(input)); err == nil {
				t.Errorf("want error, got %+v", doc)
			}
		})
	}
}

func TestSerializeDocument_NilMetadataStillHasFrontMatter(t *testing.T) {
	out, err := SerializeDocument(&models.Document{Content: "body"})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(string(out), "---\n") || !strings.HasSuffix(string(out), "---\n\nbody") {
		t.Errorf("unexpected output %q", out)
	}
}
