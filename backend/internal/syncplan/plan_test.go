package syncplan

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func isMD(p string) bool { return len(p) > 3 && p[len(p)-3:] == ".md" }

func TestPlan(t *testing.T) {
	tests := []struct {
		name                string
		base, local, remote Tree
		apply               []Change
		conflicts           []string
	}{
		{"unchanged everywhere",
			Tree{"a.md": "1"}, Tree{"a.md": "1"}, Tree{"a.md": "1"}, nil, nil},
		{"changed remotely only: take remote",
			Tree{"a.md": "1"}, Tree{"a.md": "1"}, Tree{"a.md": "2"},
			[]Change{{Path: "a.md", Blob: "2"}}, nil},
		{"added remotely",
			Tree{}, Tree{}, Tree{"n.md": "9"},
			[]Change{{Path: "n.md", Blob: "9"}}, nil},
		{"deleted remotely, untouched locally: delete",
			Tree{"a.md": "1"}, Tree{"a.md": "1"}, Tree{},
			[]Change{{Path: "a.md", Delete: true}}, nil},
		{"changed locally only: keep",
			Tree{"a.md": "1"}, Tree{"a.md": "2"}, Tree{"a.md": "1"}, nil, nil},
		{"same change on both sides",
			Tree{"a.md": "1"}, Tree{"a.md": "2"}, Tree{"a.md": "2"}, nil, nil},
		{"page changed differently on both sides: conflict",
			Tree{"a.md": "1"}, Tree{"a.md": "2"}, Tree{"a.md": "3"}, nil, []string{"a.md"}},
		{"edited locally, deleted remotely: conflict",
			Tree{"a.md": "1"}, Tree{"a.md": "2"}, Tree{}, nil, []string{"a.md"}},
		{"deleted locally, edited remotely: conflict",
			Tree{"a.md": "1"}, Tree{}, Tree{"a.md": "3"}, nil, []string{"a.md"}},
		{"other file changed on both sides: remote wins",
			Tree{".obsidian/w.json": "1"}, Tree{".obsidian/w.json": "2"}, Tree{".obsidian/w.json": "3"},
			[]Change{{Path: ".obsidian/w.json", Blob: "3"}}, nil},
		{"no shared history: union, same path differs = conflict",
			Tree{}, Tree{"a.md": "1", "l.md": "5"}, Tree{"a.md": "2", "r.md": "6"},
			[]Change{{Path: "r.md", Blob: "6"}}, []string{"a.md"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Plan(tt.base, tt.local, tt.remote, isMD)
			assert.Equal(t, tt.apply, got.Apply)
			assert.Equal(t, tt.conflicts, got.Conflicts)
		})
	}
}

func TestResolve(t *testing.T) {
	r := Result{Conflicts: []string{"a.md", "b.md", "c.md"}}
	remote := Tree{"a.md": "ra", "b.md": "rb"} // c.md deleted remotely
	got, unresolved := Resolve(r, remote, map[string]Resolution{
		"a.md": {Side: SideRemote, RemoteBlob: "ra"},
		"b.md": {Side: SideLocal, RemoteBlob: "old"}, // remote moved on: ask again
		"c.md": {Side: SideRemote, RemoteBlob: ""},   // take the deletion
	})
	assert.Equal(t, []Change{{Path: "a.md", Blob: "ra"}, {Path: "c.md", Delete: true}}, got.Apply)
	assert.Equal(t, []string{"b.md"}, unresolved)
	assert.Equal(t, []string{"b.md"}, got.Conflicts)
}
