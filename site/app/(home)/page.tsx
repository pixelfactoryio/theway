import Link from 'next/link';
import type { Metadata } from 'next';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactNode } from 'react';
import { ArrowRight, FileCode2, RotateCcw, SquareTerminal } from 'lucide-react';
import { resolveLinkItems } from 'fumadocs-ui/layouts/shared';
import { InstallPill } from '@/components/install-pill';
import { WorkflowDemo } from '@/components/workflow-demo';
import { commandDescription } from '@/lib/commands';
import { githubUrl } from '@/lib/layout.shared';
import { inlineCode } from '@/lib/inline-code';
import { column, installCommand, openGraphBase, pageUrl, tagline, title } from '@/lib/site';

export const metadata: Metadata = {
  alternates: { canonical: pageUrl('/') },
  openGraph: { ...openGraphBase, title, description: tagline, url: pageUrl('/') },
};

/* The GitHub mark the docs' sidebar draws (Fumadocs' link item for `githubUrl`). */
const githubMark = resolveLinkItems({ githubUrl }).find((item) => item.type === 'icon')?.icon;

/* The example change every crop on the page follows. */
const change = 'add-rate-limit';
const changeDir = `~/.theway/projects/-home-you-code-my-api/changes/${change}`;

/* One line of a file crop: plain text, or a YAML key and its value. */
type Line = { text: string; key?: string; dim?: boolean };

/* One line of a session crop: the user's prompt, a tool call with its result, or the agent's message. */
type Entry =
  | { kind: 'prompt'; text: string }
  | { kind: 'tool'; name: string; args: string; result?: string }
  | { kind: 'report'; label: string; result: 'pass' | 'fail'; note?: string }
  | { kind: 'message'; text: string }
  | { kind: 'text'; text: string; dim?: boolean };

type Crop = { kind: 'file'; path: string; language: string; lines: Line[] } | { kind: 'session'; entries: Entry[] };

type Stage = { command: string; body: ReactNode; facts: [string, ReactNode][]; crop: Crop };

const stages: Stage[] = [
  {
    command: '/theway:engineering',
    body: (
      <>
        It investigates the request and writes <code>spec.md</code> and <code>change.yaml</code> in the change folder: the
        decisions and their reasons, the risks and the ordered tasks. Critic agents then review them through two lenses.
        No code is written in this step.
      </>
    ),
    facts: [
      ['Workflow', <code key="w">engineering</code>],
      ['Review lenses', 'grounding, implementability'],
      ['Small change', <code key="l">--light</code>],
    ],
    crop: {
      kind: 'file',
      path: `${changeDir}/change.yaml`,
      language: 'YAML',
      lines: [
        { key: 'version', text: 'theway.change/v1beta1' },
        { key: 'description', text: 'Limit each client IP to 60 requests per minute' },
        { key: 'tasks', text: '' },
        { text: '  - text: Add the limiter middleware' },
        { text: '    done: false', dim: true },
        { text: '  - text: Read the limits from the config' },
        { text: '    done: false', dim: true },
        { text: '  - text: Return 429 with Retry-After' },
        { text: '    done: false', dim: true },
      ],
    },
  },
  {
    command: '/theway:workflow',
    body: (
      <>
        By default the <code>develop</code> workflow works through the tasks in your session and commits nothing. The{' '}
        <code>agents</code> workflow hands them to agents that implement, review, fix what is confirmed, open the pull
        request and drive CI to green. Every step answers pass, fail or blocked.
      </>
    ),
    facts: [
      [
        'Shipped workflows',
        <>
          <code>develop</code>, <code>agents</code>, <code>engineering</code>, <code>engineering-light</code>
        </>,
      ],
      ['Your own', <code key="o">workflows/&lt;name&gt;.yaml</code>],
      ['Merging', 'by you, or in a series by the run after your yes'],
    ],
    crop: {
      kind: 'session',
      entries: [
        { kind: 'prompt', text: `/theway:workflow --workflow agents ${change}` },
        { kind: 'report', label: '1.branch', result: 'pass' },
        { kind: 'report', label: '2.implement', result: 'pass', note: '3 commits' },
        { kind: 'report', label: '3.review[prompts/conformance.md]', result: 'pass' },
        { kind: 'report', label: '3.review[prompts/correctness.md]', result: 'pass' },
        { kind: 'report', label: '4.triage', result: 'fail', note: '1 confirmed' },
        { kind: 'report', label: '4.fix-review', result: 'pass' },
        { kind: 'report', label: '4.triage (round 2)', result: 'pass' },
        { kind: 'report', label: '5.open-pr', result: 'pass', note: 'PR #42' },
        { kind: 'report', label: '6.ci', result: 'pass' },
        { kind: 'message', text: 'PR #42 is open and CI passes.' },
      ],
    },
  },
  {
    command: '/theway:archive',
    body: (
      <>
        A finished change moves to <code>changes/archive/</code> under a dated folder, with its spec and tasks. It only
        happens when you name the change and ask, and it refuses while a task is open unless you accept it.
      </>
    ),
    facts: [
      ['Listing', <code key="li">/theway:list</code>],
      ['Open tasks', 'refused, or accepted by you'],
    ],
    crop: {
      kind: 'session',
      entries: [
        { kind: 'prompt', text: `/theway:archive ${change}` },
        { kind: 'tool', name: 'Bash', args: 'theway list', result: `${change}  3 files   3/3 tasks done` },
        {
          kind: 'tool',
          name: 'Bash',
          args: `theway archive ${change}`,
          result: `Archived: ~/.theway/projects/-home-you-code-my-api/changes/archive/2026-11-26-${change}`,
        },
      ],
    },
  },
];

const commands = ['engineering', 'workflow', 'list', 'archive', 'document'];

/* The shipped agents workflow, read at build time from the repository, so the crop is the real file. */
const agentsWorkflow: Line[] = readFileSync(join(process.cwd(), '..', 'plugin', 'home', 'workflows', 'agents.yaml'), 'utf-8')
  .trimEnd()
  .split('\n')
  .map((line) => {
    const top = /^([a-z-]+):\s?(.*)$/.exec(line);
    return top ? { key: top[1], text: top[2] } : { text: line };
  });

/* The keys of a step, as the Workflows docs page lists them. */
const stepKeys: [string, string][] = [
  ['uses', 'the prompt it runs, prompts/<name>.md'],
  ['with', "the prompt's inputs"],
  ['runs-on', 'agents or session'],
  ['model', 'opus, sonnet or haiku'],
  ['matrix', 'one run per value'],
  ['on-fail', 'the prompt that fixes a fail; the step then runs again'],
  ['tries', 'how many times on-fail may run'],
];

/* The review loop of the agents workflow (plugin/home/workflows/agents.yaml), on the full-change example. */
type LoopStep = { who: string; text: string; repeat?: string; crop: Crop };

const loop: LoopStep[] = [
  {
    who: 'prompts/review.md',
    text: 'One reviewer agent per lens tries to break the diff and checks it against `spec.md` and the project’s standards. It edits nothing and reports every finding with its file, line and evidence.',
    crop: {
      kind: 'session',
      entries: [
        { kind: 'report', label: '3.review[prompts/conformance.md]', result: 'pass', note: '1 finding' },
        { kind: 'text', text: 'src/app.js: close() does not clear the sweep timer. spec.md, Memory bound: "cleared on server close".' },
        { kind: 'report', label: '3.review[prompts/correctness.md]', result: 'pass', note: '1 finding' },
        { kind: 'text', text: 'src/app.js: the 429 body differs from the 404 body.' },
      ],
    },
  },
  {
    who: 'prompts/triage.md',
    text: 'Checks each finding against the code and `spec.md` and gives it one verdict: confirmed, false positive, duplicate, nit or out of scope. It fails while a finding is confirmed.',
    crop: {
      kind: 'session',
      entries: [
        { kind: 'report', label: '4.triage', result: 'fail', note: '1 confirmed' },
        { kind: 'text', text: '0 confirmed: no clearInterval on close.' },
        { kind: 'text', text: '1 false_positive: both bodies are JSON {"error": ...}.', dim: true },
      ],
    },
  },
  {
    who: 'prompts/fix-review.md',
    text: 'Fixes the confirmed findings and nothing else, commits on the feature branch and re-runs the CI commands locally. The triage then runs again and checks the fix.',
    repeat: 'triage again, up to tries',
    crop: {
      kind: 'session',
      entries: [
        { kind: 'report', label: '4.fix-review', result: 'pass', note: '1 commit' },
        { kind: 'report', label: '4.triage (round 2)', result: 'pass' },
        { kind: 'text', text: '0 resolved: close() clears the sweep timer.' },
      ],
    },
  },
];

const startHere: [string, string, string][] = [
  ['Installation', 'Install, update, pin and uninstall theway.', '/docs/installation/'],
  [
    'A full change',
    'Rate limiting added to a small Node API: the request, the spec, the tasks, the code and the tests.',
    '/docs/examples/full-change/',
  ],
  ['Workflows', 'The YAML files `/theway:workflow` runs and the prompts their steps use.', '/docs/concepts/workflows/'],
  ['Configuration', 'Every key of `config.yaml`, with its default and meaning.', '/docs/configuration/'],
];

const h2 = 'text-balance text-title font-semibold tracking-display';
const button = 'inline-flex h-9 items-center justify-center gap-2 rounded-lg px-4 text-ui font-medium transition-colors';
const window = 'overflow-hidden rounded-xl border border-line bg-panel shadow-panel';
const prose = '[&_code]:font-mono [&_code]:text-code [&_code]:text-ink';
/* Long lines of a crop (paths, tool output) wrap anywhere inside the panel, as Claude Code wraps them. */
const wrap = 'min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]';

/* A crop's header: the file or the session it shows, as the dashboard's 40px header. */
function CropHeader({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-10 items-center gap-2 border-b border-line px-4 text-code text-dim">
      {icon}
      <span className="min-w-0 truncate font-mono">{children}</span>
    </div>
  );
}

function FileCrop({ crop }: { crop: Extract<Crop, { kind: 'file' }> }) {
  return (
    <figure className={window}>
      <CropHeader icon={<FileCode2 aria-hidden="true" className="size-4 shrink-0" />}>
        {crop.path.split('/').slice(-2).join('/')}
      </CropHeader>
      <div className="py-3 font-mono text-code">
        {crop.lines.map((line, i) => (
          <div key={i} className="flex">
            <span aria-hidden="true" className="w-11 shrink-0 select-none pr-4 text-right text-dim">
              {i + 1}
            </span>
            {line.key ? (
              <span className={wrap}>
                <span className="text-(--code-property)">{line.key}</span>
                <span className="text-dim">:</span> {line.text}
              </span>
            ) : (
              <span className={`${wrap} ${line.dim ? 'text-dim' : ''}`}>{line.text}</span>
            )}
          </div>
        ))}
      </div>
      <figcaption className="flex h-7 items-center gap-3 border-t border-line px-4 text-code text-dim">
        <span className="font-mono">{crop.path.split('/').pop()}</span>
        <span>{crop.language}</span>
        <span>{crop.lines.length} lines</span>
      </figcaption>
    </figure>
  );
}

function SessionCrop({ entries }: { entries: Entry[] }) {
  return (
    <figure className={window}>
      <CropHeader icon={<SquareTerminal aria-hidden="true" className="size-4 shrink-0" />}>claude — my-api</CropHeader>
      <div className="flex flex-col gap-1.5 py-4 font-mono text-code">
        {entries.map((entry, i) => {
          switch (entry.kind) {
            case 'prompt':
              return (
                <div key={i} className="mx-3 mb-1.5 rounded-md bg-band px-3 py-1.5">
                  <span className="text-dim">&gt; </span>
                  {entry.text}
                </div>
              );
            case 'tool':
              return (
                <div key={i} className="px-4">
                  <div className={wrap}>
                    <span className="text-success">● </span>
                    <span className="font-medium">{entry.name}</span>
                    <span className="text-dim">({entry.args})</span>
                  </div>
                  {entry.result ? (
                    <div className="flex pl-4 text-dim">
                      <span className="shrink-0 whitespace-pre">⎿ </span>
                      <span className={wrap}>{entry.result}</span>
                    </div>
                  ) : null}
                </div>
              );
            case 'report':
              return (
                <div key={i} className="flex gap-3 px-4">
                  <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                  {entry.note ? <span className="hidden text-dim sm:inline">{entry.note}</span> : null}
                  <span className={`w-10 text-right ${entry.result === 'pass' ? 'text-success' : 'text-(--destructive)'}`}>
                    {entry.result}
                  </span>
                </div>
              );
            case 'text':
              return (
                <div key={i} className={`flex px-4 ${entry.dim ? 'text-dim' : ''}`}>
                  <span className="shrink-0 whitespace-pre text-dim">- </span>
                  <span className={wrap}>{entry.text}</span>
                </div>
              );
            case 'message':
              return (
                <div key={i} className="mt-1.5 px-4">
                  <span className="text-dim">● </span>
                  {entry.text}
                </div>
              );
          }
        })}
      </div>
    </figure>
  );
}

function StageRow({ stage }: { stage: Stage }) {
  return (
    <div className="grid gap-8 md:grid-cols-12 md:gap-12">
      <div className="flex flex-col md:col-span-5 md:pt-2">
        <h3 className="font-mono text-[1.25rem] font-medium leading-7 tracking-[-0.01em]">{stage.command}</h3>
        <p className={`mt-3 text-pretty text-ui text-dim ${prose}`}>{stage.body}</p>
        <dl className="mt-6 divide-y divide-line border-y border-line text-[14px]">
          {stage.facts.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-4 py-2.5">
              <dt className="text-dim">{label}</dt>
              <dd className={`text-right ${prose}`}>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="min-w-0 md:col-span-7">
        {stage.crop.kind === 'file' ? <FileCrop crop={stage.crop} /> : <SessionCrop entries={stage.crop.entries} />}
      </div>
    </div>
  );
}

/* A list of links as the dashboard's rows: one line each on the panel, the name, its description, an arrow. */
function LinkRows({ rows, mono = false }: { rows: [string, string, string][]; mono?: boolean }) {
  return (
    <ul className="overflow-hidden rounded-xl border border-line bg-panel shadow-panel">
      {rows.map(([name, description, href]) => (
        <li key={href} className="border-b border-rule last:border-b-0">
          <Link
            href={href}
            className="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-hover focus-visible:-outline-offset-2 md:px-5"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-4">
              <span className={`shrink-0 sm:w-44 ${mono ? 'font-mono text-code' : 'text-ui font-medium'}`}>{name}</span>
              <span className={`text-pretty text-[14px] text-dim ${prose}`}>{inlineCode(description)}</span>
            </span>
            <ArrowRight
              aria-hidden="true"
              className="size-4 shrink-0 text-dim transition-transform group-hover:translate-x-0.5 group-hover:text-ink"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function HomePage() {
  const commandRows: [string, string, string][] = commands.map((name) => [
    `/theway:${name}`,
    commandDescription(name),
    `/docs/commands/${name}/`,
  ]);

  return (
    <div className="flex flex-1 flex-col">
      <section aria-labelledby="hero" className={`${column} pt-12 md:pt-16`}>
        <div className="grid items-end gap-8 min-[1360px]:grid-cols-[minmax(0,1fr)_31rem] min-[1360px]:gap-10">
          <div>
            <h1
              id="hero"
              className="text-pretty text-display-sm font-semibold tracking-display md:text-display"
            >
              A spec-first workflow for Claude&nbsp;Code
            </h1>
            <p className={`mt-5 max-w-[40rem] text-pretty text-lead text-dim ${prose}`}>
              <code>/theway:engineering</code> writes a spec and ordered tasks for a change. <code>/theway:workflow</code>{' '}
              implements them by running a workflow: a YAML file of steps, each a Markdown prompt, run in your session or through agents.
            </p>
          </div>
          <div className="flex min-w-0 max-w-[31rem] flex-col gap-2.5">
            <InstallPill command={installCommand} />
            <div className="grid gap-2.5 sm:grid-cols-2">
              <Link href="/docs/" className={`${button} bg-action text-white hover:bg-action/90`}>
                Read the docs
              </Link>
              <Link
                href="/docs/concepts/workflows/"
                className={`${button} border border-line bg-panel hover:bg-hover`}
              >
                How a workflow runs
              </Link>
            </div>
          </div>
        </div>
        <div className="mt-12 md:mt-14">
          <WorkflowDemo />
        </div>
      </section>

      <section aria-labelledby="workflows" className={`${column} pt-24 md:pt-36`}>
        <h2 id="workflows" className={h2}>
          Workflows
        </h2>
        <p className={`mt-3 max-w-[40rem] text-pretty text-lead text-dim ${prose}`}>
          A workflow is the list of steps a change goes through, in a YAML file that <code>/theway:workflow</code> runs
          in order. Each step uses a Markdown prompt, its instructions, and runs in your session or through agents.
        </p>
        <div className="mt-12 grid gap-8 md:mt-16 md:grid-cols-12 md:gap-12">
          <div className="flex flex-col md:col-span-5 md:pt-2">
            <p className={`text-pretty text-ui text-dim ${prose}`}>
              Every run of a step answers pass, fail or blocked, with a report the later steps read. A fail runs the
              step&apos;s <code>on-fail</code> prompt, when it has one, then the step again, up to <code>tries</code>{' '}
              times; otherwise, and on blocked, the run stops and reports to you.
            </p>
            <p className={`mt-3 text-pretty text-ui text-dim ${prose}`}>
              Writing the spec is a workflow too. theway ships <code>develop</code> (the default: the tasks implemented
              in your session, nothing committed), <code>agents</code>, <code>engineering</code> and{' '}
              <code>engineering-light</code>, written the same way as yours. Yours go in{' '}
              <code>~/.theway/workflows/</code>, or in a project&apos;s folder, where a file replaces the global one of
              the same name.
            </p>
            <dl className="mt-6 divide-y divide-line border-y border-line text-[14px]">
              {stepKeys.map(([key, meaning]) => (
                <div key={key} className="flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="shrink-0 whitespace-nowrap font-mono text-code">{key}</dt>
                  <dd className="text-right text-dim">{meaning}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="min-w-0 md:col-span-7">
            <FileCrop crop={{ kind: 'file', path: '~/.theway/workflows/agents.yaml', language: 'YAML', lines: agentsWorkflow }} />
          </div>
        </div>
      </section>

      <section aria-labelledby="loop" className={`${column} pt-24 md:pt-36`}>
        <h2 id="loop" className={h2}>
          The feedback loop
        </h2>
        <p className={`mt-3 max-w-[40rem] text-pretty text-lead text-dim ${prose}`}>
          <code>/theway:engineering</code> settles every decision in the spec, with you, before any code. Then{' '}
          <code>/theway:workflow --workflow=agents add-rate-limit</code> checks the code against that spec in three steps,
          and fixes it until the check passes. CI runs the same loop, with <code>ci</code> and <code>fix-ci</code>.
        </p>
        <ol className="mt-12 md:mt-16">
          {loop.map((step, i) => (
            <li key={i} className="relative grid grid-cols-[0.75rem_minmax(0,1fr)] gap-x-5 pb-14 last:pb-0 md:gap-x-8">
              {i < loop.length - 1 ? (
                <span aria-hidden="true" className="absolute bottom-0 left-[calc(0.375rem-0.5px)] top-5 w-px bg-line" />
              ) : null}
              <span
                aria-hidden="true"
                className="mt-1.5 size-3 rounded-full border-2 border-action bg-ground"
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className={`font-mono text-code font-medium ${wrap}`}>{step.who}</span>
                  {step.repeat ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-0.5 text-[13px] text-dim">
                      <RotateCcw aria-hidden="true" className="size-3.5" />
                      {step.repeat}
                    </span>
                  ) : null}
                </div>
                <p className={`mt-2 max-w-[40rem] text-pretty text-ui text-dim ${prose}`}>{inlineCode(step.text)}</p>
                <div className="mt-5 max-w-[48rem]">
                  {step.crop.kind === 'file' ? <FileCrop crop={step.crop} /> : <SessionCrop entries={step.crop.entries} />}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="how" className={`${column} pt-24 md:pt-36`}>
        <h2 id="how" className={h2}>
          Commands
        </h2>
        <p className={`mt-3 max-w-[40rem] text-pretty text-lead text-dim ${prose}`}>
          A change&apos;s spec, tasks and notes are files in your theway home, <code>~/.theway</code> by default, outside
          the repository.
        </p>
        <ol className="mt-12 flex flex-col gap-20 md:mt-16 md:gap-28">
          {stages.map((stage) => (
            <li key={stage.command}>
              <StageRow stage={stage} />
            </li>
          ))}
        </ol>
      </section>

      <section aria-label="Commands and docs" className={`${column} grid gap-12 pt-24 md:pt-36 lg:grid-cols-2 lg:gap-8`}>
        <div>
          <h2 className={h2}>All commands</h2>
          <div className="mt-8">
            <LinkRows rows={commandRows} mono />
          </div>
        </div>
        <div>
          <h2 className={h2}>Docs</h2>
          <div className="mt-8">
            <LinkRows rows={startHere} />
          </div>
        </div>
      </section>

      <section aria-labelledby="install" className={`${column} pb-20 pt-24 md:pb-28 md:pt-36`}>
        <div className="flex flex-col items-start gap-6 rounded-xl border border-line bg-panel p-6 shadow-panel md:flex-row md:items-center md:justify-between md:p-8">
          <div>
            <h2 id="install" className="text-[1.375rem] font-semibold leading-7 tracking-[-0.015em]">
              Install theway
            </h2>
            <p className={`mt-2 text-pretty text-ui text-dim ${prose}`}>
              It installs the <code>theway</code> CLI in <code>~/.local/bin</code> and the Claude Code plugin. Then
              start a new session or run <code>/reload-plugins</code>.
            </p>
          </div>
          <InstallPill command={installCommand} className="w-full md:w-auto md:shrink-0" />
        </div>
      </section>

      <footer className="border-t border-line">
        <div className={`${column} flex flex-wrap items-center gap-x-6 gap-y-2 py-6 text-[14px] text-dim`}>
          <span>MIT License</span>
          <a href={githubUrl} className="inline-flex items-center gap-1.5 transition-colors hover:text-ink">
            <span aria-hidden="true" className="flex size-4 [&_svg]:size-4">
              {githubMark}
            </span>
            GitHub
          </a>
          <Link href="/docs/" className="transition-colors hover:text-ink">
            Docs
          </Link>
        </div>
      </footer>
    </div>
  );
}
