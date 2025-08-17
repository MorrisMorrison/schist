## Description
Briefly describe the changes in this PR and why they are needed.

Fixes #(issue)

## Type of Change
Please check the relevant option(s):

- [ ] 🐛 Bug fix (non-breaking change which fixes an issue)
- [ ] ✨ New feature (non-breaking change which adds functionality)
- [ ] 💥 Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] 📖 Documentation update
- [ ] 🧹 Code cleanup/refactoring
- [ ] ⚡ Performance improvement
- [ ] 🔒 Security enhancement
- [ ] 🎨 UI/UX improvement
- [ ] 🧪 Test improvements
- [ ] 🔧 Configuration/infrastructure changes

## Changes Made
### Frontend Changes
- [ ] Added/modified Svelte components
- [ ] Updated styles/CSS
- [ ] Modified routing
- [ ] Changed API client calls
- [ ] Updated stores/state management
- [ ] Modified keyboard shortcuts
- [ ] Other frontend changes: ___________

### Backend Changes
- [ ] Modified Go handlers/APIs
- [ ] Updated database/storage logic
- [ ] Changed authentication/security
- [ ] Modified Git integration
- [ ] Updated configuration options
- [ ] Changed middleware/services
- [ ] Other backend changes: ___________

### Infrastructure Changes
- [ ] Modified Dockerfile
- [ ] Updated docker-compose.yml
- [ ] Changed Makefile targets
- [ ] Updated GitHub Actions
- [ ] Modified scripts
- [ ] Other infrastructure changes: ___________

## Testing Checklist
Please verify that your changes pass all relevant tests:

### Automated Testing
- [ ] `make verify` passes (formatting, linting, type checking)
- [ ] `make test` passes (backend unit tests)
- [ ] `npm run test:unit` passes (frontend unit tests)
- [ ] `make e2e` passes (end-to-end tests)

### Manual Testing
**Core Functionality:**
- [ ] Document creation/editing works
- [ ] Wiki linking (`[[Document Name]]`) functions correctly
- [ ] Search functionality works
- [ ] Folder management works
- [ ] Navigation/routing works as expected

**Authentication (if auth is enabled):**
- [ ] Login/logout works
- [ ] Passkey authentication functions
- [ ] User management works
- [ ] Protected routes work correctly

**Advanced Features (if applicable):**
- [ ] Version history works
- [ ] GitHub integration functions
- [ ] Public sharing works
- [ ] File uploads work
- [ ] Export functionality works
- [ ] Templates work correctly
- [ ] Secret storage works (if applicable)

**Browser Testing:**
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (if applicable)
- [ ] Mobile browsers (if UI changes)

## Security Considerations
- [ ] No sensitive data is logged or exposed
- [ ] Input validation is implemented where needed
- [ ] Authentication/authorization is preserved
- [ ] XSS prevention measures are in place
- [ ] SQL injection prevention (if database queries modified)
- [ ] No hardcoded secrets or credentials

## Performance Impact
- [ ] No significant performance degradation
- [ ] Database queries are optimized (if applicable)
- [ ] Frontend bundle size not significantly increased
- [ ] Memory usage considerations addressed

## Documentation Updates
- [ ] README.md updated (if user-facing changes)
- [ ] API documentation updated (if API changes)
- [ ] Configuration documentation updated (if new config options)
- [ ] Development documentation updated (if dev process changes)
- [ ] No documentation updates needed

## Breaking Changes
If this introduces breaking changes, please describe:
- What breaks?
- Migration path for existing users
- Version compatibility impact

**Migration Notes:**
```
Any specific migration steps or notes for users
```

## Screenshots/Videos
If your changes affect the UI, please include screenshots or screen recordings:

**Before:**
<!-- Add screenshots of the old behavior -->

**After:**
<!-- Add screenshots of the new behavior -->

## Additional Notes
- Any deployment considerations?
- Dependencies added/removed?
- Configuration changes required?
- Known limitations or follow-up work needed?

## Checklist
- [ ] I have performed a self-review of my code
- [ ] I have commented my code where necessary (focusing on WHY, not WHAT)
- [ ] I have made corresponding changes to documentation
- [ ] My changes generate no new warnings or errors
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
- [ ] Any dependent changes have been merged and published
- [ ] I have followed the project's coding standards and conventions
- [ ] I have tested this change in a realistic environment (not just development)

## Reviewer Notes
@MorrisMorrison - any specific areas you'd like me to focus on during review?