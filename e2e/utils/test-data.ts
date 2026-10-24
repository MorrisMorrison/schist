export interface TestDocumentData {
	title: string;
	content: string;
	tags?: string[];
	path?: string;
}

export function generateTestId(): string {
	return `test-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function createTestDocument(overrides: Partial<TestDocumentData> = {}): TestDocumentData {
	const testId = generateTestId();
	const title = overrides.title || `Test Document ${testId}`;

	return {
		title: title,
		content: `# ${title}\n\nThis is a test document created for e2e testing.\n\n## Features\n\n- **Bold text**\n- *Italic text*\n- \`Inline code\`\n\n### Code Block\n\n\`\`\`javascript\nfunction hello() {\n  console.log('Hello, World!');\n}\n\`\`\`\n\n### Links\n\n[Test Link](https://example.com)\n\n### Image\n\n![Test Image](https://via.placeholder.com/300x200?text=Test+Image)\n\n---\n\nCreated at: ${new Date().toISOString()}`,
		tags: ['test', 'e2e'],
		...overrides
	};
}

export function createSimpleTestDocument(
	overrides: Partial<TestDocumentData> = {}
): TestDocumentData {
	const testId = generateTestId();
	const title = overrides.title || `Simple ${testId}`;
	return {
		title: title,
		content: `# ${title}\n\nThis is a simple test document with minimal content.`,
		tags: ['simple'],
		...overrides
	};
}

export function createComplexTestDocument(
	overrides: Partial<TestDocumentData> = {}
): TestDocumentData {
	const testId = generateTestId();
	const title = overrides.title || `Complex Document ${testId}`;
	return {
		title: title,
		content: `# ${title}

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
