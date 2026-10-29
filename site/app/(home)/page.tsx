import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import {
  Activity,
  Archive,
  ArrowRight,
  BookOpen,
  CircleCheck,
  Code,
  FileText,
  FolderClock,
  GitPullRequest,
  Hand,
  List,
  ListChecks,
  ListTodo,
  type LucideIcon,
  Search,
  Settings,
  ShieldAlert,
} from 'lucide-react';
import { InstallPill } from '@/components/install-pill';
import { basePath } from '@/lib/base-path.mjs';
import { commandDescription } from '@/lib/commands';
import { githubUrl } from '@/lib/layout.shared';
import { column, mono, tagline } from '@/lib/site';

const installCommand = 'npx --yes github:pixelfactoryio/theway install';

/* One line of a file window: `heading` is a Markdown heading, `check` marks a task line. */
type FileLine = { text: string; heading?: boolean; check?: 'done' | 'open' };

/* One entry of an agent session: the user's prompt, a tool call with its optional result, or the agent's message. */
type Entry =
  | { kind: 'prompt'; text: string }
  | { kind: 'tool'; name: string; args: string; result?: string }
  | { kind: 'message'; text: string };

/* A file window shows numbered lines; a session window shows an agent transcript and its input box. */
/* `input` ends a session with the agent's input box. */
type Mock = { type: 'file'; title: string; lines: FileLine[] } | { type: 'session'; entries: Entry[]; input?: boolean };

const sessionTitle = 'claude — my-api';

type Feature = { icon: LucideIcon; title: string; href?: string; body: ReactNode };

type Step = { title: string; subline: ReactNode; mocks: Mock[]; features: Feature[] };

const steps: Step[] = [
  {
    title: 'Write the spec before the code',
    subline: (
      <>
        <code className="text-accent-text">/theway:engineering</code> investigates the request, then writes <code>spec.md</code> and{' '}
        <code>tasks.md</code>. No code is written in this step.
      </>
    ),
    mocks: [
      {
        type: 'session',
        input: true,
        entries: [
          { kind: 'prompt', text: '/theway:engineering add rate limiting to the public API' },
          { kind: 'tool', name: 'Read', args: '~/.theway/config.yaml' },
          { kind: 'tool', name: 'Read', args: 'src/api/router.ts' },
          { kind: 'tool', name: 'Write', args: '~/.theway/my-api/changes/add-rate-limit/spec.md' },
          { kind: 'tool', name: 'Write', args: '~/.theway/my-api/changes/add-rate-limit/tasks.md' },
          {
            kind: 'message',
            text: 'Spec and tasks written. Review them before developing.',
          },
        ],
      },
    ],
    features: [
      {
        icon: Search,
        title: 'Facts first',
        body: 'Questions the design depends on are investigated and written into the spec as findings.',
      },
      {
        icon: ShieldAlert,
        title: 'TAMM hardpoints',
        href: '/docs/concepts/tamm/',
        body: 'Medium and High risks across Time, Autonomy, Mastery and Machine, each with countermeasures.',
      },
      {
        icon: ListChecks,
        title: 'Numbered tasks',
        body: (
          <>
            <code>tasks.md</code> splits the work into numbered tasks, grouped by phase.
          </>
        ),
      },
    ],
  },
  {
    title: 'Implement task by task',
    subline: (
      <>
        <code className="text-accent-text">/theway:develop</code> works through the tasks in your session. <code className="text-accent-text">/theway:develop-workflow</code>{' '}
        hands them to agents that open a pull request.
      </>
    ),
    mocks: [
      {
        type: 'file',
        title: 'tasks.md',
        lines: [
          { text: '## Phase 1: Core', heading: true },
          { text: '1. Add the limiter middleware', check: 'done' },
          { text: '2. Read limits from config', check: 'done' },
          { text: '3. Return 429 with Retry-After', check: 'open' },
        ],
      },
      {
        type: 'session',
        entries: [
          { kind: 'prompt', text: '/theway:develop-workflow add-rate-limit' },
          { kind: 'tool', name: 'Agent', args: 'implement add-rate-limit', result: 'PR #42 opened' },
          { kind: 'tool', name: 'Agent', args: 'review PR #42', result: '2 findings, 2 confirmed' },
          { kind: 'tool', name: 'Agent', args: 'fix PR #42', result: '2 resolved' },
          { kind: 'tool', name: 'Bash', args: 'gh pr checks 42', result: 'test  pass' },
          { kind: 'message', text: 'PR #42 is ready for you to merge.' },
        ],
      },
    ],
    features: [
      {
        icon: CircleCheck,
        title: 'Verified against the spec',
        body: 'Each Success Criterion is reported with the command or test that verified it, or flagged as unverified.',
      },
      {
        icon: GitPullRequest,
        title: 'Adversarial review',
        body: 'Reviewer agents try to break the diff; a fix agent addresses confirmed findings, and a fix check confirms them.',
      },
      {
        icon: Activity,
        title: 'CI driven to green',
        body: 'Failed runs are diagnosed from the real error line, within a set number of attempts.',
      },
    ],
  },
  {
    title: 'Keep the history',
    subline: (
      <>
        <code className="text-accent-text">/theway:archive</code> moves a finished change to <code>changes/archive/</code>, dated, and only when you
        ask for it by name.
      </>
    ),
    mocks: [
      {
        type: 'session',
        entries: [
          { kind: 'prompt', text: '/theway:archive add-rate-limit' },
          {
            kind: 'tool',
            name: 'Bash',
            args: '~/.theway/bin/theway archive my-api add-rate-limit',
            result: 'Archived: ~/.theway/my-api/changes/archive/2026-10-28-add-rate-limit',
          },
        ],
      },
    ],
    features: [
      {
        icon: Hand,
        title: 'Explicit only',
        body: '"It\'s merged" or "ship it" never archives a change: you name the change and ask.',
      },
      {
        icon: ListTodo,
        title: 'No open tasks',
        body: (
          <>
            Archiving refuses while a numbered task in <code>tasks.md</code> is unticked, unless you accept the open
            tasks.
          </>
        ),
      },
      {
        icon: FolderClock,
        title: 'Dated archive',
        body: 'Every archived change keeps its spec and tasks under a dated folder.',
      },
    ],
  },
];

const commandIcons: [string, LucideIcon][] = [
  ['setup', Settings],
  ['engineering', FileText],
  ['develop', Code],
  ['develop-workflow', GitPullRequest],
  ['document', BookOpen],
  ['list', List],
  ['archive', Archive],
];

const h1 = 'text-balance text-hero-sm font-bold uppercase leading-display tracking-display md:text-hero';
const h2 = 'text-balance text-title-sm font-bold uppercase leading-display tracking-display md:text-title';
const subline =
  'mx-auto max-w-prose text-pretty text-lg leading-relaxed text-body [&_code]:font-mono [&_code]:text-[0.9em]';
const sectionPad = 'px-4 py-20 md:px-12 md:py-32';
const h3 = 'text-balance text-2xl font-bold uppercase leading-display tracking-display md:text-4xl';
const button = 'inline-flex h-10 items-center justify-center px-4 font-mono uppercase tracking-wider transition-colors';
const frame = `${column} border-x border-dashed`;

/* A 9px `+` mark where a separator meets a guide line. */
function Cross({ className }: { className: string }) {
  return (
    <svg
      aria-hidden="true"
      width="9"
      height="9"
      viewBox="0 0 9 9"
      shapeRendering="crispEdges"
      className={`absolute z-10 text-fd-muted-foreground ${className}`}
    >
      <path d="M4 0v9M0 4h9" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

/* Crosses on the line at the top of the element, at both guide lines. */
function Crosses() {
  return (
    <div aria-hidden="true" className={`relative ${column}`}>
      <Cross className="-left-1 -top-[5px]" />
      <Cross className="-right-1 -top-[5px]" />
    </div>
  );
}

/* A full-width dashed separator between sections. */
function Separator() {
  return (
    <div aria-hidden="true" className="border-t border-dashed">
      <Crosses />
    </div>
  );
}

/* A full-width row framed by the dashed guide lines. */
function Band({ children, className = '', label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <section aria-label={label}>
      <div className={`${frame} ${className}`}>{children}</div>
    </section>
  );
}

/* Text that may break only at spaces or right after a `/`: each `/`-delimited segment stays whole. */
function Breakable({ text }: { text: string }) {
  return text.split(' ').map((word, w) => (
    <Fragment key={w}>
      {w > 0 ? ' ' : null}
      {word.split('/').map((part, i, parts) => (
        <Fragment key={i}>
          <span className="whitespace-nowrap">
            {part}
            {i < parts.length - 1 ? '/' : null}
          </span>
          {i < parts.length - 1 ? <wbr /> : null}
        </Fragment>
      ))}
    </Fragment>
  ));
}

/* One wrapped line: continuation lines hang under the text after the prefix. */
function Row({ prefix, children, className = '' }: { prefix?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`flex ${className}`}>
      {prefix ? <span className="shrink-0 whitespace-pre">{prefix}</span> : null}
      <span className="min-w-0 whitespace-pre-wrap">{children}</span>
    </div>
  );
}

function FileLines({ lines }: { lines: FileLine[] }) {
  return (
    <div className="py-3 font-mono text-code leading-6">
      {lines.map((line, i) => (
        <div key={i} className="flex">
          <span aria-hidden="true" className="w-10 shrink-0 select-none pr-4 text-right text-fd-muted-foreground">
            {i + 1}
          </span>
          <Row
            className={`min-w-0 flex-1 pr-4 ${line.check === 'done' ? 'text-fd-muted-foreground' : ''} ${
              line.heading ? 'font-semibold' : ''
            }`}
            prefix={
              line.check ? <span className="text-fd-primary">{line.check === 'done' ? '- [x] ' : '- [ ] '}</span> : undefined
            }
          >
            <Breakable text={line.text} />
          </Row>
        </div>
      ))}
    </div>
  );
}

function SessionEntry({ entry }: { entry: Entry }) {
  switch (entry.kind) {
    case 'prompt':
      return (
        <Row prefix="> " className="bg-fd-foreground/5 px-4 py-1">
          <Breakable text={entry.text} />
        </Row>
      );
    case 'tool':
      return (
        <div className="px-4">
          <Row prefix={<span className="text-fd-primary">● </span>}>
            <span className="font-semibold">{entry.name}</span>
            <span className="text-fd-muted-foreground">
              (<Breakable text={entry.args} />)
            </span>
          </Row>
          {entry.result ? (
            <Row prefix={<span className="text-fd-muted-foreground">⎿ </span>} className="pl-4">
              <Breakable text={entry.result} />
            </Row>
          ) : null}
        </div>
      );
    case 'message':
      return (
        <Row prefix="● " className="px-4">
          <Breakable text={entry.text} />
        </Row>
      );
  }
}

function Session({ entries, input = false }: { entries: Entry[]; input?: boolean }) {
  return (
    <div className="font-mono text-code leading-6 text-body">
      <div className={`flex flex-col gap-2 pt-3 ${input ? '' : 'pb-4'}`}>
        {entries.map((entry, i) => (
          <SessionEntry key={i} entry={entry} />
        ))}
      </div>
      {input ? (
        <div className="mx-4 my-4 border px-3 py-1.5">
          &gt; <span aria-hidden="true">▍</span>
        </div>
      ) : null}
    </div>
  );
}

function Window({ mock, className = '' }: { mock: Mock; className?: string }) {
  return (
    <figure className={`overflow-hidden border bg-fd-card ${className}`}>
      <figcaption className="flex h-9 items-center justify-center border-b font-mono text-xs text-fd-muted-foreground">
        {mock.type === 'file' ? mock.title : sessionTitle}
      </figcaption>
      {mock.type === 'file' ? <FileLines lines={mock.lines} /> : <Session entries={mock.entries} input={mock.input} />}
    </figure>
  );
}

function StepBlock({ step }: { step: Step }) {
  const [first, second] = step.mocks;
  return (
    <div className="flex flex-col">
      <div className="flex flex-col items-center text-center">
        <h3 className={h3}>{step.title}</h3>
        <p className={`mt-5 ${subline}`}>{step.subline}</p>
      </div>
      <div className="mt-12 grid gap-12 md:mt-16 md:grid-cols-12 md:items-center">
        <div className="min-w-0 md:col-span-7">
          <Window mock={first} className={second ? 'mr-8 pb-8' : ''} />
          {second ? <Window mock={second} className="relative -mt-8 ml-8 bg-fd-background" /> : null}
        </div>
        <ul className="border md:col-span-5">
          {step.features.map((feature) => (
            <li key={feature.title} className="flex items-start justify-between gap-4 border-b p-5 last:border-b-0">
              <div className="flex flex-col gap-2">
                <p className={`font-medium ${mono}`}>
                  {feature.href ? (
                    <Link href={feature.href} className="transition-colors hover:text-fd-primary">
                      {feature.title}
                    </Link>
                  ) : (
                    feature.title
                  )}
                </p>
                <p className="text-detail text-body [&_code]:font-mono [&_code]:text-[0.9em]">
                  {feature.body}
                </p>
              </div>
              <span className="flex size-7 shrink-0 items-center justify-center border">
                <feature.icon aria-hidden="true" className="size-3.5" />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function HomePage() {
  const commands = commandIcons.map(([name, icon]) => ({ name, icon, description: commandDescription(name) }));
  const filler = (3 - (commands.length % 3)) % 3;

  return (
    <div className="flex flex-1 flex-col">
      <Band label="Introduction" className={`${sectionPad} flex flex-col items-center gap-6 text-center`}>
        <h1 className={h1}>
          A spec-first workflow <br className="hidden md:inline" />
          for Claude Code
        </h1>
        <p className={subline}>{tagline}</p>
        <div className="mt-2 flex max-w-full flex-col items-center gap-6">
          <InstallPill command={installCommand} />
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/docs/" className={`${button} bg-amber text-code font-semibold text-ink hover:bg-amber/90`}>
              Read the docs
              <span aria-hidden="true" className="ml-4 flex h-full items-center border-l border-ink/30 pl-4">
                →
              </span>
            </Link>
            <a href={githubUrl} className={`${button} border border-fd-foreground/20 text-xs hover:bg-fd-accent`}>
              GitHub
            </a>
          </div>
        </div>
        <figure className="mt-10 flex w-full max-w-4xl flex-col gap-3">
          <video
            src={`${basePath}/demo.mp4`}
            poster={`${basePath}/demo-poster.png`}
            aria-label="A Claude Code session: /theway:engineering writes the spec and tasks, then /theway:develop implements them"
            className="w-full border"
            autoPlay
            muted
            loop
            playsInline
            controls
          />
          <figcaption className="text-xs text-fd-muted-foreground">
            Real Claude Code session on Sonnet, sped up. Idle waits shortened.
          </figcaption>
        </figure>
      </Band>

      <Separator />

      <Band label="How it works" className={sectionPad}>
        <h2 className={`text-center ${h2}`}>How it works</h2>
        <ol className="mt-16 flex flex-col gap-24 md:mt-24 md:gap-32">
          {steps.map((step) => (
            <li key={step.title}>
              <StepBlock step={step} />
            </li>
          ))}
        </ol>
      </Band>

      <Separator />

      <Band label="Commands" className="pt-20 md:pt-32">
        <h2 className={`px-4 pb-12 text-center md:pb-16 ${h2}`}>Seven commands</h2>
        <ul className="grid gap-px border-t bg-fd-border md:grid-cols-3">
          {commands.map((cmd) => (
            <li key={cmd.name} className="bg-fd-background">
              <Link
                href={`/docs/commands/${cmd.name}/`}
                className="group flex h-full flex-col gap-3 p-6 transition-colors hover:bg-fd-card md:p-8"
              >
                <span className="flex items-center gap-2 font-mono text-xs font-semibold text-accent-text">
                  <cmd.icon aria-hidden="true" className="size-4 text-fd-muted-foreground" />
                  {cmd.name}
                </span>
                <span className="flex-1 text-detail text-body">{cmd.description}</span>
                <span
                  aria-hidden="true"
                  className="mt-2 flex size-8 items-center justify-center border transition-colors group-hover:bg-fd-accent"
                >
                  <ArrowRight className="size-4" />
                </span>
              </Link>
            </li>
          ))}
          {filler > 0 ? (
            <li aria-hidden="true" className={`hidden bg-fd-background md:block ${filler === 2 ? 'md:col-span-2' : ''}`} />
          ) : null}
        </ul>
      </Band>

      <Separator />

      <footer>
        <div className={`${frame} flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-8 md:px-12`}>
          <span className={`text-fd-muted-foreground ${mono}`}>MIT License</span>
          <a href={githubUrl} className={`text-fd-muted-foreground transition-colors hover:text-fd-foreground ${mono}`}>
            GitHub
          </a>
          <Link href="/docs/" className={`text-fd-muted-foreground transition-colors hover:text-fd-foreground ${mono}`}>
            Docs
          </Link>
        </div>
      </footer>
    </div>
  );
}
