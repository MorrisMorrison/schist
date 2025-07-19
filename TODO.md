# TODO
## Frontend
- [ ] Fix possible XSS in PageView
- [ ] Update Recent Pages, lots of duplicated layout with e.g. FolderView
- [ ] Investigate if we can leverage PageList in FolderView to avoid duplication
- [ ] Allow resizing of images
- [ ] Image on click should open the image in new tab / full screen view
- [ ] Setup e2e tests
- [ ] General Search in Navigation

## Backend



## Feature Ideas
- [ ] Git integration
- [ ] Auth
- [ ] GraphView
- [ ] Advanced Search
- [ ] Exports
- [ ] Collaboration Features
- [ ] Plugins

### Phase 3: Wiki Linking (Week 3-4)
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

**Milestone**: Full wiki linking functionality workin