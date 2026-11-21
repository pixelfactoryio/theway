import { createContext, type Dispatch, type SetStateAction, useContext } from "react"

/** The search's open state, provided by the shell so the sidebar entry and the shortcut share it. */
export const SearchOpen = createContext<{ open: boolean; setOpen: Dispatch<SetStateAction<boolean>> }>({
  open: false,
  setOpen: () => {},
})

export const useSearchOpen = () => useContext(SearchOpen)
