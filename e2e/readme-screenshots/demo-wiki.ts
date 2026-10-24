// A small, made-up team wiki that the README screenshots are taken from.
// Keep it generic: no real people, companies or links.

export interface DemoDocument {
	title: string;
	path: string;
	tags: string[];
	content: string;
}

const relaunchV1 = `# Website relaunch

Owner: Design + Web · Status: **in progress**

## Goals
- Faster first load on mobile
- One design system for marketing and docs
- Content lives in markdown, reviewed like code

## Milestones
| Milestone | Target | Status |
|---|---|---|
| Content audit | Week 2 | Done |
| New navigation | Week 4 | In review |
| Launch | Week 8 | Planned |
`;

const relaunchV2 = `${relaunchV1}
## Open questions
- [x] Keep the old URLs working (redirect map in [[Deployment checklist]])
- [ ] Decide on the search provider
- [ ] Sign-off from support on the new help pages

See the notes from [[Weekly sync]] for the latest decisions.
`;

const relaunchV3 = `${relaunchV2}
## Rollout
\`\`\`bash
make build
./scripts/deploy.sh --env staging
\`\`\`
`;

export const DEMO_DOCUMENTS: DemoDocument[] = [
	{
		title: 'Getting started',
		path: '/guides/getting-started',
		tags: ['guide', 'onboarding'],
		content: `# Getting started

Welcome to the team wiki. Everything here is a plain markdown file, versioned with git, so you can edit in the browser or in your favourite editor.

## Where things live
| Folder | What goes there |
|---|---|
| **Guides** | How we work: onboarding, writing style, tooling |
| **Projects** | One page per project, linked from [[Website relaunch]] and friends |
| **Meetings** | Notes from [[Weekly sync]] and planning sessions |

## Linking pages
Type \`[[\` and a page title to link it, like [[Writing style]] or [[Deployment checklist]]. Links update when a page is renamed.

## Shortcuts
- \`Ctrl/Cmd + K\` opens the quick switcher
- \`Ctrl/Cmd + E\` edits the current page
- \`Ctrl/Cmd + S\` saves

> **Tip:** every save is a commit. Open *Version history* on any page to compare or restore an older version.

\`\`\`ts
// Pages can hold code too, with syntax highlighting.
export function greet(name: string): string {
	return \`Hello, \${name}!\`;
}
\`\`\`
`
	},
	{
		title: 'Writing style',
		path: '/guides/writing-style',
		tags: ['guide'],
		content: `# Writing style

- Lead with the answer, then the why.
- Short sections, descriptive headings.
- Prefer tables for comparisons.
`
	},
	{
		title: 'Deployment checklist',
		path: '/guides/deployment-checklist',
		tags: ['guide', 'ops'],
		content: `# Deployment checklist

- [x] Tests green
- [x] Changelog updated
- [ ] Announce in the team channel
`
	},
	{
		title: 'Website relaunch',
		path: '/projects/website-relaunch',
		tags: ['project', 'web'],
		content: relaunchV1
	},
	{
		title: 'Mobile app',
		path: '/projects/mobile-app',
		tags: ['project', 'mobile'],
		content: `# Mobile app

Offline-first notes app. Next up: sync conflicts, see [[Weekly sync]].
`
	},
	{
		title: 'Weekly sync',
		path: '/meetings/weekly-sync',
		tags: ['meeting'],
		content: `# Weekly sync

## Decisions
- Ship the new navigation behind a flag ([[Website relaunch]])
- Mobile sync conflicts: last write wins for now ([[Mobile app]])

## Action items
- [ ] Draft the redirect map
- [ ] Book the launch retro
`
	},
	{
		title: 'Meeting notes template',
		path: '/meetings/meeting-notes-template',
		tags: ['template'],
		content: `# Meeting notes

## Attendees

## Decisions

## Action items
- [ ]
`
	},
	{
		title: 'Ideas',
		path: '/ideas',
		tags: ['inbox'],
		content: `# Ideas

- A glossary page for project code names
- Monthly "what we learned" digest
`
	}
];

// Later saves of existing pages, applied in order, so version history isn't empty.
export const DEMO_EDITS: { path: string; content: string }[] = [
	{ path: '/projects/website-relaunch', content: relaunchV2 },
	{ path: '/projects/website-relaunch', content: relaunchV3 }
];
