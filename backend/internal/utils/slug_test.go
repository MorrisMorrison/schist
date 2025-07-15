package utils_test

import (
	"testing"

	"github.com/MorrisMorrison/schist/internal/utils"
	"github.com/go-playground/assert/v2"
)

func TestGenerateSlug(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"Hello World", "hello-world"},
		{"API & REST", "api-rest"},
		{"", "untitled"},
		{"---", "untitled"},
		{"Getting Started!", "getting-started"},
	}

	for _, test := range tests {
		result := utils.GenerateSlug(test.input)
		assert.Equal(t, test.expected, result)
	}
}
