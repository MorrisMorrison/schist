// Package mcpserver serves the wiki over the Model Context Protocol, so AI
// assistants can search, read and write documents. It is mounted at /api/mcp
// behind the normal auth middleware and built on the same services as the
// REST API, so path rules, ignore rules and git commits behave the same.
package mcpserver

import (
	"context"
	"net/http"

	"github.com/MorrisMorrison/schist/internal/middleware"
	"github.com/MorrisMorrison/schist/internal/services"
	"github.com/MorrisMorrison/schist/internal/version"
	"github.com/gin-gonic/gin"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

const instructions = `Schist is a markdown wiki. Every page is a markdown file in a git repository.

- Paths look like "/folder/page" (no ".md"); "/" is the root folder.
- Start with "search" to find pages, then "read_document" for the full text.
- Link pages with [[Page title]] wiki links; tags come from the "tags" list and inline #hashtags.
- Prefer "append_to_document" to add notes to an existing page; "update_document" replaces content.
- Every write is committed to git, so earlier versions can be restored in Schist.
- Secret placeholders like {{secret:name}} are never resolved here; keep them as they are.`

type writeAccessKey struct{}

// Server holds two MCP servers: one with every tool, and one with the read
// tools only, for read-only tokens. A client never sees tools it can't call.
type Server struct {
	readOnly  *mcp.Server
	readWrite *mcp.Server
	handler   http.Handler
}

func New(svc *services.Services) *Server {
	t := &tools{svc: svc}
	s := &Server{
		readOnly:  newMCPServer(t, false),
		readWrite: newMCPServer(t, true),
	}
	s.handler = mcp.NewStreamableHTTPHandler(s.serverFor, &mcp.StreamableHTTPOptions{
		// Each request stands alone: nothing to keep in memory, and it works
		// behind any reverse proxy or load balancer.
		Stateless:    true,
		JSONResponse: true,
		// The SDK rejects localhost connections with a foreign Host header to
		// stop DNS rebinding. Behind a reverse proxy every request looks like
		// that; with auth on, the bearer token already rules rebinding out.
		DisableLocalhostProtection: svc.Config.AuthEnabled,
	})
	return s
}

func newMCPServer(t *tools, write bool) *mcp.Server {
	server := mcp.NewServer(&mcp.Implementation{Name: "schist", Title: "Schist wiki", Version: version.Version},
		&mcp.ServerOptions{Instructions: instructions})
	t.registerRead(server)
	if write {
		t.registerWrite(server)
	}
	return server
}

func (s *Server) serverFor(r *http.Request) *mcp.Server {
	if write, _ := r.Context().Value(writeAccessKey{}).(bool); write {
		return s.readWrite
	}
	return s.readOnly
}

// Handle serves an MCP request. The auth middleware has already run: a
// read-only personal access token gets the read tools only; a session, a
// read-write token or a server without auth gets all of them.
func (s *Server) Handle(c *gin.Context) {
	write := c.GetString(middleware.TokenScopeKey) != services.TokenScopeRead
	ctx := context.WithValue(c.Request.Context(), writeAccessKey{}, write)
	s.handler.ServeHTTP(c.Writer, c.Request.WithContext(ctx))
}
