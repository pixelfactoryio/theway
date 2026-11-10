/** A file's path as the File panel shows it, cut into the parts a line may break between. DOM-free. */

/** The longest part kept on one line; a longer one may break anywhere, so it never overflows the panel. */
export const MAX_PART = 34;

/** `<home>/<rel>`, with `home` as the files response shows it (`~/.theway`, or an absolute path). */
export const shownPath = (home: string, rel: string): string => `${home.replace(/\/+$/, "")}/${rel}`;

/** The parts of a path, each ending with its `/` but the last: a line breaks only between two of them. */
export const pathParts = (path: string): string[] => path.match(/[^/]*\/|[^/]+$/g) ?? [];
