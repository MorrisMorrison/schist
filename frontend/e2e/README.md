# E2E Testing Infrastructure

This directory contains the end-to-end testing infrastructure for the Schist wiki application using Playwright.

## Structure

```
e2e/
├── fixtures/                 # Test fixtures and setup
│   ├── index.ts              # Main exports
│   ├── test-setup.ts         # Basic test setup with page objects
│   └── test-data-fixtures.ts # Data management fixtures
├── documents/                    # Page Object Models
│   ├── BasePage.ts           # Base page class with common functionality
│   ├── HomePage.ts           # Home/landing page
│   ├── EditorPage.ts         # Page editor (/new and /edit routes)
│   ├── PageViewPage.ts       # Page viewing (/pages/[...path])
│   └── FolderPage.ts         # Folder management (/folders/[...path])
├── tests/                    # Test files
│   └── infrastructure.spec.ts # Infrastructure and basic functionality tests
├── utils/                    # Utility functions
│   ├── test-data.ts          # Test data generation utilities
│   ├── api-helpers.ts        # API interaction helpers
│   └── assertions.ts         # Custom assertion helpers
├── demo.test.ts              # Legacy demo test (kept for compatibility)
├── README.md                 # This file
└── playwright.config.ts      # Enhanced Playwright configuration
```

## Quick Start

### Running Tests

```bash
# Run all e2e tests
npm run test:e2e

# Run specific test file
npx playwright test infrastructure.spec.ts

# Run with UI mode
npx playwright test --ui

# Run and show report
npx playwright show-report
```

### Writing Tests

```typescript
import { test, expect } from '../fixtures';

test('my test', async ({ homePage, testDocument }) => {
	await homePage.navigate();
	await homePage.verifyLoaded();
	// Test logic here
});

// Both documentViewPage and pageViewPage (legacy) are available
test('document test', async ({ documentViewPage, testDocument }) => {
	await documentViewPage.navigateToDocument(testDocument.path!);
	await documentViewPage.verifyDocumentLoaded(testDocument.title);
});
```

````

## Page Objects

### HomePage

- Navigation and search functionality
- Recent pages display
- Main application entry point

### EditorPage

- Document creation and editing
- Auto-save functionality
- Form validation
- Content management

### DocumentViewPage

- Document content display
- Navigation and breadcrumbs
- Action buttons (edit, delete, move)
- Markdown rendering verification

### FolderPage

- Folder navigation and management
- Folder tree interactions
- Content organization
- Hierarchical structure testing

## Test Data Management

### Fixtures

- `testDocument` - Generated test document data
- `testPage` - Generated test page data (legacy alias)
- `withTestDocument` - Creates actual document in backend
- `withTestPage` - Creates actual page in backend (legacy alias)
- `withMultipleDocuments` - Creates multiple test documents
- `withMultiplePages` - Creates multiple test pages (legacy alias)
- `withNestedStructure` - Creates folder structure with documents

### Test Data Utilities

```typescript
import { createTestDocument, createComplexTestDocument } from '../utils/test-data';

const document = createTestDocument({ title: 'My Test Document' });
const complex = createComplexTestDocument({ tags: ['demo', 'test'] });

// Legacy aliases still available
const page = createTestPage({ title: 'My Test Document' });
````

## API Helpers

Direct backend interaction for test setup and verification:

```typescript
import { ApiHelper } from '../utils/api-helpers';

// Create document via API
await apiHelper.createDocument(documentData);

// Verify document exists
await apiHelper.getDocument('/my-document');

// Cleanup test data
await apiHelper.cleanupTestData();

// Legacy methods still available
await apiHelper.createPage(pageData);
await apiHelper.getPage('/my-document');
```

## Custom Assertions

Enhanced assertions for common test patterns:

```typescript
import { expectVisibleText, expectPageLoaded } from '../utils/assertions';

await expectVisibleText(locator, 'Expected text');
await expectPageLoaded(page);
await expectErrorMessage(page, 'Validation failed');
```

## Configuration

### Browser Testing

- **Chromium** - Primary browser for development
- **Firefox** - Cross-browser compatibility
- **WebKit/Safari** - WebKit engine testing
- **Mobile** - Responsive design testing (Pixel 5, iPhone 12)

### Timeouts

- **Test timeout**: 30 seconds
- **Assertion timeout**: 5 seconds
- **Build timeout**: 2 minutes

### Reporting

- **HTML Report** - Visual test results
- **JSON Report** - Machine-readable results
- **Console Output** - Real-time test progress

## Best Practices

### Test Organization

1. Use descriptive test names
2. Group related tests in `describe` blocks
3. Keep tests focused and independent
4. Use appropriate fixtures for test data

### Page Objects

1. Encapsulate page interactions
2. Use meaningful locator names
3. Include verification methods
4. Handle async operations properly

### Test Data

1. Use unique identifiers for test data
2. Clean up after tests
3. Use fixtures for consistent setup
4. Avoid hardcoded values

### Assertions

1. Use custom assertions for common patterns
2. Verify both positive and negative cases
3. Check for proper error handling
4. Validate accessibility where applicable

## Debugging

### Local Development

```bash
# Run with headed browser
npx playwright test --headed

# Debug specific test
npx playwright test --debug infrastructure.spec.ts

# Generate trace
npx playwright test --trace on
```

### CI/CD

- Screenshots on failure
- Video recordings for failed tests
- Trace files for debugging
- Retry mechanism for flaky tests

## Common Issues

### Test Flakiness

- Use proper waits instead of timeouts
- Wait for network requests to complete
- Ensure proper test isolation
- Use stable locators

### Data Management

- Always clean up test data
- Use unique identifiers
- Avoid dependencies between tests
- Reset application state when needed

### Performance

- Run tests in parallel when possible
- Use API for test setup when appropriate
- Optimize selectors and waits
- Monitor test execution time

## Next Steps

This infrastructure supports the implementation of comprehensive e2e tests for:

1. **Document Lifecycle** - Create, edit, view, delete operations
2. **Navigation** - Routing, breadcrumbs, error handling
3. **Search** - Real-time search, result interaction
4. **Folders** - Hierarchical organization, tree navigation
5. **Editor Features** - Rich editing, auto-save, shortcuts
6. **Error Handling** - Validation, network failures, recovery
7. **Asset Management** - File uploads, image handling
8. **User Journeys** - Complete workflows end-to-end

The foundation is now ready for Phase 2 implementation of core functionality tests.
