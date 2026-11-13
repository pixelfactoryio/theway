/** The theme choice and how it is kept. Pure: no React, no DOM. */

export type Theme = "system" | "light" | "dark";

/** The `localStorage` key of the theme; System removes it. */
export const THEME_KEY = "theway-theme";

/** The theme a stored value stands for: `light` and `dark` as such, anything else System. */
export const themeOf = (stored: string | null): Theme => (stored === "light" || stored === "dark" ? stored : "system");

/** The `data-theme` value of the root element for a theme, `null` for System (the attribute is removed). */
export const dataTheme = (theme: Theme): string | null => (theme === "system" ? null : theme);
