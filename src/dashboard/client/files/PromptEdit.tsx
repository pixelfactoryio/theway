/** Edit mode's centre for a prompt: its body in one text area, as tall as its content; the header stays byte for byte. */
import { cn } from "cn";
import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { bodyOf } from "../editor/prompt";

/** The body's text area: it keeps what is typed while the draft's body is that text, and shows the draft's otherwise, as on undo. */
export function PromptEdit({ text, setBody }: { text: string; setBody: (body: string) => void }) {
  const body = bodyOf(text);
  const [typed, setTyped] = useState(body);
  const [seen, setSeen] = useState(body);
  if (seen !== body) {
    setSeen(body);
    if (typed !== body) setTyped(body);
  }
  return (
    <div className="flex w-full max-w-[720px] flex-col gap-2">
      <h2 className="font-medium">Instructions</h2>
      <Textarea
        aria-label="Instructions"
        className={cn("min-h-40 bg-card font-mono text-[13px] md:text-[13px]")}
        value={typed}
        spellCheck={false}
        onChange={(e) => {
          setTyped(e.target.value);
          setBody(e.target.value);
        }}
      />
    </div>
  );
}
