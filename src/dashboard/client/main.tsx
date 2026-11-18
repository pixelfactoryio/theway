import { CSPProvider } from "@base-ui/react/csp-provider"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { App } from "@/app"
import { meta } from "@/data/api"
import { applyStoredTheme } from "@/shell/theme"

/** The style nonce of this page's response, which Base UI puts on the `<style>` tags it injects. */
const nonce = meta("nonce")

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
})

applyStoredTheme()

const root = document.getElementById("root")
if (root !== null) {
  createRoot(root).render(
    <StrictMode>
      <CSPProvider nonce={nonce}>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </CSPProvider>
    </StrictMode>,
  )
}
