// Turns user text into a pattern that matches it literally, so characters like
// ( or .* can't break or widen a search
export const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
