// Package syncplan decides what a two-way sync does with each file, from the
// last shared commit (base) and the two sides. It is pure: no git, no disk.
package syncplan

import "sort"

// Tree maps a repository path (slash separated) to its git blob hash.
type Tree map[string]string

// Change is one file to bring in from the remote side.
type Change struct {
	Path   string
	Delete bool
	Blob   string
}

// Result is what to apply locally, or the pages that need a decision first.
type Result struct {
	Apply     []Change
	Conflicts []string
}

// Side is whose version a resolved conflict keeps.
type Side string

const (
	SideLocal  Side = "local"
	SideRemote Side = "remote"
)

// Resolution is a decision for one conflicting page, made while the remote
// version was RemoteBlob ("" for deleted). It only counts while it still is.
type Resolution struct {
	Side       Side
	RemoteBlob string
}

// Plan classifies every path in the three trees. A page changed differently on
// both sides (edits, or an edit against a deletion) is a conflict; any other
// file changed on both sides takes the remote version.
func Plan(base, local, remote Tree, isPage func(path string) bool) Result {
	paths := map[string]bool{}
	for _, t := range []Tree{base, local, remote} {
		for p := range t {
			paths[p] = true
		}
	}
	var res Result
	for p := range paths {
		b, l, r := base[p], local[p], remote[p]
		switch {
		case l == r, r == b:
			// nothing to bring in
		case l == b:
			res.Apply = append(res.Apply, change(p, r))
		case isPage(p):
			res.Conflicts = append(res.Conflicts, p)
		default:
			res.Apply = append(res.Apply, change(p, r))
		}
	}
	sortResult(&res)
	return res
}

// Resolve applies decisions to a plan's conflicts. A decision made against an
// older remote version is dropped; those pages come back as unresolved.
func Resolve(r Result, remote Tree, resolutions map[string]Resolution) (Result, []string) {
	out := Result{Apply: append([]Change(nil), r.Apply...)}
	for _, p := range r.Conflicts {
		res, ok := resolutions[p]
		if !ok || res.RemoteBlob != remote[p] {
			out.Conflicts = append(out.Conflicts, p)
			continue
		}
		if res.Side == SideRemote {
			out.Apply = append(out.Apply, change(p, remote[p]))
		}
	}
	sortResult(&out)
	return out, out.Conflicts
}

func change(path, blob string) Change {
	if blob == "" {
		return Change{Path: path, Delete: true}
	}
	return Change{Path: path, Blob: blob}
}

func sortResult(r *Result) {
	sort.Slice(r.Apply, func(i, j int) bool { return r.Apply[i].Path < r.Apply[j].Path })
	sort.Strings(r.Conflicts)
}
