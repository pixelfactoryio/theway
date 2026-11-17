import { MonitorIcon, MoonIcon, Settings2Icon, SunIcon } from "lucide-react"
import { useState } from "react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { dataTheme, THEME_KEY, type Theme, themeOf } from "@/lib/theme"
import { readStored, writeStored } from "@/shell/storage"

const readTheme = (): Theme => themeOf(readStored(THEME_KEY))

/** Sets or removes `data-theme` on the root element; System leaves the page to `prefers-color-scheme`. */
function applyTheme(theme: Theme): void {
  const value = dataTheme(theme)
  if (value === null) document.documentElement.removeAttribute("data-theme")
  else document.documentElement.setAttribute("data-theme", value)
}

/** Applies `theme` at once and keeps it in this browser. */
export function chooseTheme(theme: Theme): void {
  applyTheme(theme)
  writeStored(THEME_KEY, theme === "system" ? null : theme)
}

/** Applies the theme kept in this browser, before the first render. */
export function applyStoredTheme(): void {
  applyTheme(readTheme())
}

/**
 * The sidebar footer's Settings menu: the theme, System, Light or Dark, applied at once and kept in this browser.
 */
export function SettingsMenu() {
  const [theme, setTheme] = useState<Theme>(readTheme)

  const choose = (value: unknown) => {
    const next = themeOf(typeof value === "string" ? value : null)
    setTheme(next)
    applyTheme(next)
    writeStored(THEME_KEY, next === "system" ? null : next)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Settings"
            className="size-7 text-muted-foreground aria-expanded:bg-sidebar-accent aria-expanded:text-foreground"
          />
        }
      >
        <Settings2Icon aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={theme} onValueChange={choose}>
            <DropdownMenuRadioItem value="system" closeOnClick>
              <MonitorIcon aria-hidden="true" />
              System
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="light" closeOnClick>
              <SunIcon aria-hidden="true" />
              Light
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark" closeOnClick>
              <MoonIcon aria-hidden="true" />
              Dark
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
