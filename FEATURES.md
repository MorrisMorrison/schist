This document is a list of features we want to build.

# Feature 1 - Import Functionality
We want to allow importing markdown documents in multiple ways.
1. Import button at the bottom of our sidebar
The import button should open a import modal
Via the modal you should be able to select a file or complete folder containing md documents.
You should also be able to select the target path where you want to import to.
We want to support plain md files, and especially obsidian md files (not sure if they have specific meta data we need to adjust)


● Updated Implementation Plan for Feature 1 - Import Functionality

  Key Updates Based on Your Feedback

  1. Obsidian Compatibility Clarification

  - Goal: Handle Obsidian markdown files during import
  - Approach: Ignore Obsidian metadata, generate fresh Schist metadata
  - Implementation: Strip any existing YAML frontmatter and create new metadata using our system's structure

  2. API Routing Solution

  Based on the existing routing structure, I'll use:
  POST /api/import/documents

  This avoids the wildcard conflict with /api/documents/*path by placing it at the root level, following the
  pattern used for other non-document routes like /api/search, /api/tags, etc.

  Revised Implementation Plan

  Phase 1: Backend Foundation

  1. Import Types & Models - Define ImportOptions, ImportResult structures
  2. DocumentService Extension - Add ImportDocuments method that:
    - Processes markdown files regardless of source (Obsidian, plain markdown)
    - Strips existing frontmatter
    - Generates fresh Schist metadata (title, slug, path, created/updated timestamps)
  3. API Handler - Create /api/import/documents endpoint with multipart form handling

  Phase 2: Frontend Components

  4. Import Modal - ImportDocumentsModal.svelte with:
    - File/folder selection (support both single files and entire directories)
    - Target path selection within existing folder structure
    - Progress indication and error handling
  5. API Integration - Extend frontend API client with import methods
  6. Sidebar Integration - Add import button to FolderTree actions section

  Phase 3: Advanced Features

  7. Obsidian Processing - Specifically handle Obsidian files by:
    - Recognizing common Obsidian patterns (wiki links, tags)
    - Converting or ignoring Obsidian-specific syntax
    - Ensuring clean import into Schist's markdown format
  8. Testing - Backend validation and E2E tests

  Technical Details

  File Processing Strategy:
  - Accept .md files from any source
  - Parse content to separate frontmatter from markdown
  - Discard existing metadata, generate new Schist metadata
  - Handle file naming conflicts with collision resolution

  API Endpoint Structure:
  // In SetupAPIRoutes, add before document group:
  routerGroup.POST("/import/documents", h.importDocuments)


# Feature 2 - Export Functionality 
We want to  allow exporting documents in multiple ways
1. Download a single document
2. Download a complete folder including all its content
3. Download all files, as plain root folder with contents

We want to add the following ways to do that:
1. Context menu entry in foldertree in our sidebar. Entry should be called export. the entry should exist in root folder, folder, and file context menu


# Feature 3 - Connection to GitHub Repository
We already version our documents internally using git. The goal of this feature is to integrate with github, to allow pushing all our documents to github as a backup mechanism.

# Feature 4 - Editor in Fullscreen mode
We want to allow editing documents in a fullscreen mode.
We probably want to add a full screen button that opens the editor in full screen mode.

# Feature 5 - OIDC Integration
We want to allow setting schist up as a oidc client, so users can use their oidc provider to authenticate this app. Our main goal is to use pocket-id as a oidc provider for now.

# Feature 5 - Update  color system
I want to have the same background colors beszel uses. 
Additionally update the  editor styling to match the styling of our app.
