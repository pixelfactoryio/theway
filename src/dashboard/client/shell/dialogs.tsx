import { createContext, useContext } from "react"

import type { ShellDialog } from "@/shell/keys"

/** The dialog the shell shows over the page, and how to open one (`null` closes it); provided by the shell. */
export const DialogOpen = createContext<{ dialog: ShellDialog; open: (d: ShellDialog) => void }>({
  dialog: null,
  open: () => {},
})

export const useDialog = () => useContext(DialogOpen)
