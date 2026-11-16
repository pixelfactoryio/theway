import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react"
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
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { dataTheme, THEME_KEY, type Theme, themeOf } from "@/lib/theme"
import { readStored, writeStored } from "@/shell/storage"

const readTheme = (): Theme => themeOf(readStored(THEME_KEY))

/** Sets or removes `data-theme` on the root element; System leaves the page to `prefers-color-scheme`. */
function applyTheme(theme: Theme): void {
  const value = dataTheme(theme)
  if (value === null) document.documentElement.removeAttribute("data-theme")
  else document.documentElement.setAttribute("data-theme", value)
}

/** Applies the theme kept in this browser, before the first render. */
export function applyStoredTheme(): void {
  applyTheme(readTheme())
}

const ICONS = { system: MonitorIcon, light: SunIcon, dark: MoonIcon } as const

/** The sidebar footer's Theme menu: System, Light or Dark, applied at once, kept in this browser; a choice closes it. */
export function ThemeMenu() {
  const [theme, setTheme] = useState<Theme>(readTheme)
  const Icon = ICONS[theme]

  const choose = (value: unknown) => {
    const next = themeOf(typeof value === "string" ? value : null)
    setTheme(next)
    applyTheme(next)
    writeStored(THEME_KEY, next === "system" ? null : next)
  }

  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <SidebarMenuButton
              tooltip="Theme"
              className="aria-expanded:bg-sidebar-accent aria-expanded:text-sidebar-accent-foreground"
            />
          }
        >
          <Icon className="size-4" aria-hidden="true" />
          <span>Theme</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="end" className="w-40">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Theme</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={theme} onValueChange={choose}>
              <DropdownMenuRadioItem value="system" closeOnClick>
                System
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="light" closeOnClick>
                Light
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark" closeOnClick>
                Dark
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  )
}
