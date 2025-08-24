# Schist E2E Tests

End-to-end testing suite for the Schist application using Playwright.

## Project Structure

```
e2e/
├── package.json           # E2E-specific dependencies (Playwright)
├── playwright.config.ts   # Playwright configuration
├── auth.setup.ts          # Authentication setup script
├── global-teardown.ts     # Global cleanup script
├── tests/                 # Test files (22 test suites)
├── pages/                 # Page Object Models
├── fixtures/              # Test fixtures and utilities
└── utils/                 # Helper functions and constants
```

## Getting Started

### Installation

```bash
# Install dependencies
npm install

# Install Playwright browsers
npm run install-browsers
```

### Running Tests

```bash
# Run all tests
npm test

# Run with UI mode
npm run test:ui

# Run in headed mode (see browser)
npm run test:headed

# Debug mode
npm run test:debug
```

### Using Make Commands (from project root)

```bash
# Run E2E tests
make e2e

# Run with UI
make e2e-ui

# Run specific test file
make e2e-test TEST=authentication.test.ts

# Run tests matching pattern
make e2e-grep GREP="should login successfully"
```

## Test Architecture

### Page Object Models (POM)
- `BasePage.ts` - Base page with common functionality
- `HomePage.ts` - Home page interactions
- `EditorPage.ts` - Document editor interactions
- `FolderPage.ts` - Folder management
- `SettingsPage.ts` - Settings page
- `DocumentViewPage.ts` - Document viewing
- `SharedDocumentPage.ts` - Shared document viewing

### Test Categories
- **Infrastructure** - Basic connectivity and health checks
- **Authentication** - Passkey-based authentication flow
- **Document Lifecycle** - Create, edit, save, delete documents
- **Content Persistence** - Data persistence across sessions
- **Navigation** - Application navigation and routing
- **Markdown Features** - Markdown rendering and editing
- **Folder Management** - Folder creation, navigation, organization
- **Security** - XSS protection and input sanitization
- **GitHub Integration** - Version control features
- **Search** - Document search functionality
- **Sharing** - Document sharing capabilities

## Configuration

### Environment Variables
- `PLAYWRIGHT_BASE_URL` - Target application URL (default: http://localhost:3000)
- `CI` - Set to true in CI environments

### Docker Integration
Tests run against the `schist-e2e` Docker service defined in `docker-compose.yml`:
- Port: 3000
- Profile: e2e
- Authentication: enabled
- Environment: production

## CI/CD Integration

The GitHub Actions workflow:
1. Builds and starts the E2E Docker service
2. Waits for health checks to pass
3. Runs all Playwright tests
4. Generates test reports
5. Cleans up Docker resources

## Test Data Management

Tests use ephemeral data that is automatically cleaned up:
- Global teardown script removes test data
- Docker containers are recreated for each run
- No persistent state between test runs

## Development

### Adding New Tests
1. Create test file in `tests/` directory
2. Use Page Object Models from `pages/` directory  
3. Import fixtures from `fixtures/index.ts`
4. Follow existing naming conventions

### Writing Page Objects
- Extend `BasePage` class
- Use descriptive locator names
- Include assertion methods
- Add navigation helpers

### Debugging Tests
```bash
# Run specific test in debug mode
npx playwright test tests/authentication.test.ts --debug

# Generate trace files
npx playwright test --trace on

# View test results
npx playwright show-report
```

## Architecture Benefits

### Separated from Frontend
- Independent versioning and dependencies
- Cleaner separation of concerns
- Frontend remains lightweight
- Dedicated E2E environment

### Well-Isolated Design  
- No direct frontend code dependencies
- API-based interactions only
- Self-contained utilities
- Comprehensive Page Object Models

This E2E project provides comprehensive testing coverage while maintaining clean separation from the main application code.