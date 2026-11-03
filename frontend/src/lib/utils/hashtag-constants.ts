// A tag starts a word: at the start, or after whitespace, an opening bracket or
// a quote. So `fill:#fff`, `page#install` and `a#b` are not tags.
export const HASHTAG_REGEX = /(?<![^\s(["'])#([a-zA-Z0-9_-]+)(?!\w)/g;
export const HASHTAG_PARTIAL_REGEX = /#([a-zA-Z0-9_-]*)$/;
