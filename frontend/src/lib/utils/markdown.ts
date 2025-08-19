import { marked } from 'marked';

marked.setOptions({
	breaks: true,
	gfm: true
});

function configuredMarked(input: string): string {
	return marked.parse(input) as string;
}

configuredMarked.parse = marked.parse.bind(marked);

export { configuredMarked };
