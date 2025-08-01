/**
 * Test data utilities for generating consistent test content
 */

export interface TestDocumentData {
	title: string;
	content: string;
	tags?: string[];
	path?: string;
	slug?: string;
}

export interface TestFolderData {
	name: string;
	path: string;
	description?: string;
}

/**
 * Generate unique test identifiers
 */
export function generateTestId(): string {
	return `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function generateSlug(title: string): string {
	return (
		title
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '') || ''
	);
}
/**
 * Generate test document data
 */
export function createTestDocument(overrides: Partial<TestDocumentData> = {}): TestDocumentData {
	const testId = generateTestId();
	const slug = generateSlug(overrides.title!);

	return {
		title: `Test Document ${testId}`,
		content: `# Test Document ${testId}\n\nThis is a test document created for e2e testing.\n\n## Features\n\n- **Bold text**\n- *Italic text*\n- \`Inline code\`\n\n### Code Block\n\n\`\`\`javascript\nfunction hello() {\n  console.log('Hello, World!');\n}\n\`\`\`\n\n### Links\n\n[Test Link](https://example.com)\n\n### Image\n\n![Test Image](https://via.placeholder.com/300x200?text=Test+Image)\n\n---\n\nCreated at: ${new Date().toISOString()}`,
		tags: ['test', 'e2e'],
		slug: slug,
		...overrides
	};
}

/**
 * Generate simple test document
 */
export function createSimpleTestDocument(
	overrides: Partial<TestDocumentData> = {}
): TestDocumentData {
	const testId = generateTestId();
	return {
		title: `Simple ${testId}`,
		content: `# Simple Test Document\n\nThis is a simple test document with minimal content.`,
		tags: ['simple'],
		...overrides
	};
}

/**
 * Generate complex test document with various markdown elements
 */
export function createComplexTestDocument(
	overrides: Partial<TestDocumentData> = {}
): TestDocumentData {
	const testId = generateTestId();
	return {
		title: `Complex Document ${testId}`,
		content: `# Complex Test Document ${testId}

## Table of Contents

1. [Headers](#headers)
2. [Text Formatting](#text-formatting)
3. [Lists](#lists)
4. [Code](#code)
5. [Links and Images](#links-and-images)
6. [Tables](#tables)

## Headers

### Level 3 Header
#### Level 4 Header
##### Level 5 Header

## Text Formatting

This paragraph contains **bold text**, *italic text*, ***bold and italic***, and \`inline code\`.

> This is a blockquote with some important information.

## Lists

### Unordered List
- Item 1
- Item 2
  - Nested item 2.1
  - Nested item 2.2
- Item 3

### Ordered List
1. First item
2. Second item
3. Third item

### Task List
- [x] Completed task
- [ ] Pending task
- [ ] Another pending task

## Code

### JavaScript
\`\`\`javascript
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log(fibonacci(10));
\`\`\`

### Python
\`\`\`python
def hello_world():
    print("Hello, World!")
    
if __name__ == "__main__":
    hello_world()
\`\`\`

## Links and Images

- [External Link](https://example.com)
- [Wiki Link](Page Name)
- ![Test Image](https://via.placeholder.com/400x300?text=Complex+Test+Image)

## Tables

| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Row 1    | Data     | Value    |
| Row 2    | More     | Info     |
| Row 3    | Test     | Data     |

---

Created: ${new Date().toISOString()}
Test ID: ${testId}`,
		tags: ['complex', 'markdown', 'test', 'e2e', 'demo'],
		...overrides
	};
}

/**
 * Generate test folder data
 */
export function createTestFolder(overrides: Partial<TestFolderData> = {}): TestFolderData {
	const testId = generateTestId();
	return {
		name: `test-folder-${testId}`,
		path: `/test-folder-${testId}`,
		description: `Test folder for e2e testing - ${testId}`,
		...overrides
	};
}

/**
 * Generate nested folder structure
 */
export function createNestedFolders(depth: number = 3): TestFolderData[] {
	const folders: TestFolderData[] = [];
	const baseId = generateTestId();

	let currentPath = '';
	for (let i = 1; i <= depth; i++) {
		const folderName = `level-${i}-${baseId}`;
		currentPath += `/${folderName}`;

		folders.push({
			name: folderName,
			path: currentPath,
			description: `Level ${i} folder in nested structure`
		});
	}

	return folders;
}

/**
 * Generate test documents for a folder
 */
export function createDocumentsForFolder(
	folderPath: string,
	count: number = 3
): TestDocumentData[] {
	const documents: TestDocumentData[] = [];

	for (let i = 1; i <= count; i++) {
		const testId = generateTestId();
		documents.push({
			title: `Document ${i} - ${testId}`,
			content: `# Document ${i} in ${folderPath}\n\nThis is document ${i} located in the ${folderPath} folder.\n\nTest content for document ${i}.`,
			tags: ['folder-test', `document-${i}`],
			path: `${folderPath}/document-${i}-${testId}`
		});
	}

	return documents;
}

/**
 * Sample content types for different test scenarios
 */
export const testContent = {
	// Empty content
	empty: '',

	// Minimal content
	minimal: '# Test\n\nMinimal content.',

	// Only title
	titleOnly: '# Just a Title',

	// Large content
	large: `# Large Test Document

${Array.from(
	{ length: 50 },
	(_, i) =>
		`## Section ${i + 1}\n\nThis is section ${i + 1} with some content that makes the page quite long. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.\n\n`
).join('')}`,

	// Special characters
	specialChars: `# Special Characters Test

This page tests various special characters:

- Quotes: "double" and 'single'
- Symbols: @#$%^&*()
- Unicode: 🎯 🚀 ⭐ 💡 🔧
- Accents: café, naïve, résumé
- Math: α β γ δ ∞ ∑ ∫ ≈ ≠
- Arrows: → ← ↑ ↓ ⟷

## Code with Special Chars

\`\`\`javascript
const special = {
  "unicode": "🚀",
  "math": "x ≈ π",
  "quotes": '"nested" and \\'single\\''
};
\`\`\``,

	// Invalid markdown
	invalidMarkdown: `# Broken Markdown

This has **unclosed bold

And [broken link](

\`\`\`
Unclosed code block

> Broken blockquote
without proper formatting

## Missing

### headers
`,

	// Wiki links
	wikiLinks: `# Wiki Links Test

Internal links:
- [[Home Page]]
- [[Documentation/API]]
- [[Projects/Website/Overview]]

Mixed links:
- [External](https://example.com)
- [[Internal Page]]
- [Another External](https://test.com)
- [[Another/Internal/Page]]`
};

/**
 * Common test tags
 */
export const commonTags = {
	test: ['test', 'e2e', 'automation'],
	docs: ['documentation', 'guide', 'reference'],
	project: ['project', 'development', 'code'],
	feature: ['feature', 'new', 'implementation'],
	bug: ['bug', 'issue', 'fix'],
	performance: ['performance', 'optimization', 'speed']
};

/**
 * Generate random content for stress testing
 */
export function generateRandomContent(paragraphs: number = 5): string {
	const sentences = [
		'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
		'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
		'Ut enim ad minim veniam, quis nostrud exercitation ullamco.',
		'Duis aute irure dolor in reprehenderit in voluptate velit esse.',
		'Excepteur sint occaecat cupidatat non proident, sunt in culpa.',
		'Qui officia deserunt mollit anim id est laborum.',
		'Nemo enim ipsam voluptatem quia voluptas sit aspernatur.',
		'Neque porro quisquam est, qui dolorem ipsum quia dolor sit.',
		'Sed ut perspiciatis unde omnis iste natus error sit voluptatem.',
		'At vero eos et accusamus et iusto odio dignissimos ducimus.'
	];

	const content = ['# Random Generated Content\n'];

	for (let i = 0; i < paragraphs; i++) {
		const sentenceCount = Math.floor(Math.random() * 4) + 2; // 2-5 sentences
		const paragraph = Array.from(
			{ length: sentenceCount },
			() => sentences[Math.floor(Math.random() * sentences.length)]
		).join(' ');

		content.push(`\n## Paragraph ${i + 1}\n\n${paragraph}\n`);
	}

	return content.join('');
}

/**
 * Legacy aliases for backwards compatibility
 */
export type TestPageData = TestDocumentData;
export const createTestPage = createTestDocument;
export const createSimpleTestPage = createSimpleTestDocument;
export const createComplexTestPage = createComplexTestDocument;
export const createPagesForFolder = createDocumentsForFolder;
export const validateTestPage = validateTestDocument;

/**
 * Validate test data
 */
export function validateTestDocument(document: TestDocumentData): boolean {
	return !!(document.title && document.content);
}

export function validateTestFolder(folder: TestFolderData): boolean {
	return !!(folder.name && folder.path);
}
