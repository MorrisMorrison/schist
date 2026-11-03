package services

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestExtractHashtags(t *testing.T) {
	tests := []struct {
		name    string
		content string
		want    []string
	}{
		{"none", "plain text", nil},
		{"one tag", "a #garden note", []string{"garden"}},
		{"start of text", "#garden first", []string{"garden"}},
		{"several, deduplicated, in order", "#b then #a and #b again", []string{"b", "a"}},
		{"dashes and underscores", "#my-tag and #my_tag", []string{"my-tag", "my_tag"}},
		{"after brackets and quotes", `(#a) [#b] "#c" '#d'`, []string{"a", "b", "c", "d"}},
		{"heading is not a tag", "# Title\n## Sub", nil},
		{"mid-word is not a tag", "page#install a#b fill:#fff", nil},
		{"url anchor is not a tag", "https://example.com/guide#install", nil},
		{"wiki link heading is not a tag", "[[Page#Heading]]", nil},
		{"stops at punctuation", "end #done.", []string{"done"}},
		{"case is kept", "#Garden", []string{"Garden"}},
		{"inline code ignored", "use `#notatag` but #real", []string{"real"}},
		{"double-backtick span ignored", "``a ` #notatag`` #real", []string{"real"}},
		{"backtick fence ignored", "#before\n```\n#comment\n```\n#after", []string{"before", "after"}},
		{"tilde fence ignored", "~~~\n#comment\n~~~\n#after", []string{"after"}},
		{"longer fence needs a long close", "````\n```\n#inside\n````\n#after", []string{"after"}},
		{"unclosed fence runs to the end", "#before\n```\n#inside", []string{"before"}},
		{"indented fence up to 3 spaces", "   ```\n#inside\n   ```", nil},
		{"unmatched backtick is literal", "a ` #real", []string{"real"}},
		{"non-ascii stops the tag like the frontend", "#café", []string{"caf"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, extractHashtags(tt.content))
		})
	}
}

func TestMergeTags(t *testing.T) {
	assert.Equal(t, []string{"a", "b", "c"}, mergeTags([]string{"a", "b"}, []string{"b", "c"}))
	assert.Equal(t, []string{"x"}, mergeTags(nil, []string{"x"}))
	assert.Equal(t, []string{"x"}, mergeTags([]string{"x"}, nil))
	assert.Nil(t, mergeTags(nil, nil))
	assert.Equal(t, []string{}, mergeTags([]string{}, nil), "no hashtags leaves explicit tags untouched")
	assert.Equal(t, []string{"a", "b"}, mergeTags([]string{"a", "a"}, []string{"b"}), "duplicates collapse when merging")
}
