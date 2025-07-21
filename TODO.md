# TODO
## Frontend
- [ ] Fix possible XSS in PageView
- [x] Update Recent Pages, lots of duplicated layout with e.g. FolderView
- [x] Investigate if we can leverage PageList in FolderView to avoid duplication
- [ ] Allow resizing of images
- [ ] Image on click should open the image in new tab / full screen view
- [x] Setup e2e tests
- [x] General Search in Navigation
- [ ] Rename Folder

## Backend
- [ ] Optional Auth
- [ ] Rate Limiting

## Feature Ideas
- [ ] Git integration
- [ ] Auth
- [ ] GraphView
- [ ] Advanced Search
- [ ] Exports
- [ ] Collaboration Features
- [ ] Plugins

### Wiki Linking
**Goal**: Core wiki functionality with internal linking

1. **Link Parser (Backend)**
   - Parse `[[Page Name]]` syntax from markdown
   - Extract all links from page content
   - Generate backlinks data structure

2. **Link Resolver (Backend)**
   - Resolve wiki links to actual pages
   - Handle missing pages (broken links)
   - API endpoint for link data

3. **Link UI (Frontend)**
   - Clickable wiki links in preview
   - Broken link styling
   - Backlinks section in page view
   - Link suggestions in editor
