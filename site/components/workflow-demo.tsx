'use client'

import { ArrowRightToLine, ChevronDown, Copy, Plus, Search, Trash2, Wrench, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import type { Act } from './stageshow/kit/act'
import { Collapse } from './stageshow/kit/motion/Collapse'
import { Bar } from './stageshow/kit/parts/Bar'
import { Stage } from './stageshow/kit/stage'
import './workflow-demo.css'

// A step added to a workflow: the dashboard's canvas zoomed out to the whole
// workflow, its panel beside it. Everything is skeleton but the step added, so
// the eye has one text to read. The "+" under review puts the dashed
// placeholder on the canvas and opens the step picker in the panel; the search
// narrows the list; open-pr is chosen; the placeholder becomes the step, in
// words, and the panel shows its properties. It plays once when it comes into
// view and holds the result.

/* ------------------------------------------------------------------ data */

type Kind = 'inputs' | 'session' | 'agents' | 'on-fail'
/** A canvas card's bars: its title, its prompt's name, its meta on the right. */
type Card = { kind: Kind; title: number; name: number; meta: number }

const COLUMN: Card[] = [
  { kind: 'inputs', title: 92, name: 54, meta: 44 },
  { kind: 'agents', title: 176, name: 70, meta: 72 },
  { kind: 'agents', title: 168, name: 52, meta: 120 },
]
const CI: Card = { kind: 'agents', title: 140, name: 24, meta: 88 }
const FIX_CI: Card = { kind: 'on-fail', title: 156, name: 44, meta: 72 }

/** The step added: open-pr, between review and ci (prompts/open-pr.md). The only words. */
const STEP = {
  number: 3,
  total: 4,
  name: 'open-pr',
  title: 'Push the feature branch and open its PR',
  meta: 'agents · sonnet',
  uses: 'prompts/open-pr.md',
  model: 'sonnet',
  query: 'ope',
}

/** The picker's rows: description and name bars, and the query length that still keeps each (3 keeps the last three). */
const ROWS: { desc: number; name: number; keep: number }[] = [
  { desc: 212, name: 40, keep: 0 },
  { desc: 196, name: 34, keep: 3 },
  { desc: 120, name: 18, keep: 0 },
  { desc: 150, name: 46, keep: 2 },
  { desc: 168, name: 56, keep: 3 },
  { desc: 182, name: 52, keep: 1 },
  { desc: 136, name: 44, keep: 0 },
  { desc: 204, name: 64, keep: 3 },
  { desc: 190, name: 44, keep: 1 },
]
const CHOSEN = 4

/* ----------------------------------------------------------------- scene */

type S = {
  /** The placeholder on the canvas and the picker open. */
  slot: boolean
  picker: boolean
  /** Letters typed in the picker's search, 0 to 3. */
  query: number
  /** The pointer is on the chosen prompt's row. */
  hover: boolean
  /** The step added, on the canvas, its properties in the panel. */
  added: boolean
}

const initial: S = { slot: false, picker: false, query: 0, hover: false, added: false }
const done: S = { slot: true, picker: false, query: 3, hover: false, added: true }
const REST = { wide: { x: 760, y: 150 }, compact: { x: 346, y: 320 } }

async function script(a: Act<S>) {
  await a.wait(500)
  await a.move({ at: 'card-review', x: 0.72, y: 0.5 })
  await a.wait(200)
  await a.move({ at: 'add', x: 0.6, y: 0.65 })
  await a.wait(150)
  await a.click()
  await a.set({ slot: true, picker: true })
  await a.wait(600)
  for (const q of [1, 2, 3]) {
    await a.set({ query: q })
    await a.wait(150)
  }
  await a.wait(400)
  await a.move({ at: 'pick', x: 0.4, y: 0.5 })
  await a.set({ hover: true })
  await a.wait(200)
  await a.click()
  await a.set({ picker: false, added: true })
  await a.wait(350)
  await a.move(REST[a.layout])
  await a.wait(1200)
}

/** The site switches its colours with `.dark` on <html>; the stage follows it. */
function useDarkClass() {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    const root = document.documentElement
    const read = () => setDark(root.classList.contains('dark'))
    read()
    const watch = new MutationObserver(read)
    watch.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => watch.disconnect()
  }, [])
  return dark
}

export function WorkflowDemo() {
  const dark = useDarkClass()
  return (
    // A faux UI: one image to assistive tech, its controls not exposed
    <div
      role="img"
      aria-label="The workflow editor: the open-pr step is added under review, and its properties open in the panel"
    >
      <Stage<S>
        width={1344}
        height={540}
        compact={{ below: 900, width: 358, height: 680 }}
        initial={initial}
        poster={done}
        script={script}
        play="once"
        cursor={{ at: REST }}
        theme={dark ? 'dark' : 'light'}
        fidelity="minimal"
        className="wfd"
      >
        {(s) => (
          <div className="ss-window wfd-win">
            <Canvas s={s} />
            <Panel s={s} />
          </div>
        )}
      </Stage>
    </div>
  )
}

export default WorkflowDemo

/* ---------------------------------------------------------------- canvas */

function Canvas({ s }: { s: S }) {
  return (
    <div className="wfd-canvas" data-crop>
      <div className="wfd-drawing">
        <StepCard card={COLUMN[0]} />
        <Edge />
        <StepCard card={COLUMN[1]} />
        <Edge />
        <StepCard card={COLUMN[2]} target="card-review" />
        <Edge add />
        <Collapse open={s.slot}>
          <div className="wfd-added">
            <div className="wfd-slot">
              <div className="wfd-placeholder" data-show={!s.added || undefined}>
                <Plus aria-hidden />
                <Bar w={168} h={7} tone={2} />
              </div>
              <div className="wfd-slot__step" data-show={s.added || undefined}>
                <AddedCard selected={s.added} />
              </div>
            </div>
            <Edge />
          </div>
        </Collapse>
        <div className="wfd-row">
          <StepCard card={CI} />
          <span className="wfd-wire" aria-hidden>
            <Bar w={36} h={6} tone={2} r={3} className="wfd-wire__label" />
          </span>
          <StepCard card={FIX_CI} />
        </div>
      </div>
    </div>
  )
}

/** The dashboard's step card (workflow-card.tsx) in skeleton: its tile tinted by kind, a title bar over a name and a meta bar. */
function StepCard({ card, target }: { card: Card; target?: string }) {
  return (
    <div className="wfd-card" data-kind={card.kind} data-target={target}>
      <span className="wfd-card__tile">
        {card.kind === 'inputs' && <ArrowRightToLine aria-hidden />}
        {card.kind === 'on-fail' && <Wrench aria-hidden />}
      </span>
      <span className="wfd-card__text">
        <Bar w={card.title} h={8} tone={4} />
        <span className="wfd-card__line">
          <Bar w={card.name} h={6} tone={3} />
          <Bar w={card.meta} h={6} tone={2} />
        </span>
      </span>
    </div>
  )
}

/** The step added, in words: its number in the tile, what it does whole, its name in mono and where it runs. */
function AddedCard({ selected }: { selected: boolean }) {
  return (
    <div className="wfd-card wfd-card--words" data-kind="agents" data-selected={selected || undefined}>
      <span className="wfd-card__tile">{STEP.number}</span>
      <span className="wfd-card__text">
        <span className="wfd-card__title">{STEP.title}</span>
        <span className="wfd-card__line">
          <code className="wfd-card__name">{STEP.name}</code>
          <span className="wfd-card__meta">{STEP.meta}</span>
        </span>
      </span>
    </div>
  )
}

/** The line between two cards with its round "+" (AddButton), always shown; the one under review is the story's. */
function Edge({ add = false }: { add?: boolean }) {
  return (
    <div className="wfd-edge">
      <span className="wfd-plus" data-target={add ? 'add' : undefined}>
        <Plus aria-hidden />
      </span>
    </div>
  )
}

/* ----------------------------------------------------------------- panel */

/** The panel at the right (below on a phone): the workflow's cards at rest, the step picker while a step is added, then the step's card. */
function Panel({ s }: { s: S }) {
  return (
    <div className="wfd-panel" data-crop>
      <div className="wfd-view" data-show={(!s.picker && !s.added) || undefined}>
        <WorkflowCards />
      </div>
      <div className="wfd-view" data-show={s.picker || undefined}>
        <Picker s={s} />
      </div>
      <div className="wfd-view" data-show={(s.added && !s.picker) || undefined}>
        <StepProperties />
      </div>
    </div>
  )
}

/** A property card's key/value row (property-card.tsx): the key in a 100px column, the value beside it, a rule above. */
function Row({ k, children }: { k: ReactNode; children: ReactNode }) {
  return (
    <div className="wfd-prow">
      <span className="wfd-prow__key">{k}</span>
      <span className="wfd-prow__value">{children}</span>
    </div>
  )
}

/** The workflow's cards, as the panel shows them with nothing selected, in skeleton. */
function WorkflowCards() {
  const rows: [number, number][] = [
    [44, 120],
    [72, 230],
    [52, 64],
  ]
  return (
    <>
      <section className="wfd-pcard">
        <div className="wfd-pcard__head">
          <Bar w={68} h={8} tone={4} />
        </div>
        {rows.map(([k, v], i) => (
          <Row key={i} k={<Bar w={k} h={6} tone={2} />}>
            <Bar w={v} h={7} tone={3} />
          </Row>
        ))}
      </section>
      <section className="wfd-pcard">
        <div className="wfd-pcard__head">
          <Bar w={48} h={8} tone={4} />
        </div>
        <Row k={<Bar w={56} h={6} tone={2} />}>
          <Bar w={180} h={7} tone={3} />
        </Row>
      </section>
    </>
  )
}

/** The step picker (step-picker.tsx) in skeleton: header and Close, the search, the group heading, a row per prompt; the chosen prompt's row in words. */
function Picker({ s }: { s: S }) {
  const kept = ROWS.map((r) => r.keep >= s.query || s.query === 0)
  const first = kept.indexOf(true)
  return (
    <section className="wfd-pcard wfd-pcard--picker">
      <div className="wfd-pcard__head">
        <Bar w={76} h={8} tone={4} />
        <X aria-hidden className="wfd-pcard__close" />
      </div>
      <div className="wfd-picker__search">
        <Search aria-hidden />
        <span className="wfd-picker__query">{STEP.query.slice(0, s.query)}</span>
        <span className="wfd-caret" />
      </div>
      <div className="wfd-picker__group">
        <Bar w={64} h={6} tone={2} />
      </div>
      <div className="wfd-picker__list">
        {ROWS.map((r, i) => (
          <Collapse key={i} open={kept[i]}>
            <div
              className="wfd-picker__row"
              data-target={i === CHOSEN ? 'pick' : undefined}
              data-selected={(s.hover ? i === CHOSEN : i === first) || undefined}
            >
              {i === CHOSEN ? (
                <>
                  <span className="wfd-picker__desc">{STEP.title}</span>
                  <code className="wfd-picker__name">{STEP.name}</code>
                </>
              ) : (
                <>
                  <Bar w={r.desc} h={7} tone={3} />
                  <Bar w={r.name} h={6} tone={2} />
                </>
              )}
            </div>
          </Collapse>
        ))}
      </div>
    </section>
  )
}

/** The step's card (workflow-step-panel.tsx, StepEditPanel), as adding the prompt writes it: uses, and its one required input. */
function StepProperties() {
  return (
    <section className="wfd-pcard">
      <div className="wfd-pcard__head">
        <span>
          Step {STEP.number} of {STEP.total}
        </span>
        <code className="wfd-pcard__meta">{STEP.name}</code>
        <span className="wfd-button">Change prompt</span>
      </div>
      <Row k="Uses">
        <span className="wfd-uses">
          <code className="wfd-link">{STEP.uses}</code>
          <Copy aria-hidden />
        </span>
      </Row>
      <Row k="Runs on">
        <Select>Workflow&apos;s (agents)</Select>
      </Row>
      <Row k="Model">
        <Select>Prompt&apos;s ({STEP.model})</Select>
      </Row>
      <div className="wfd-pgroup">With</div>
      <Row
        k={
          <span className="wfd-input-key">
            <code>change</code>
            <small>required</small>
          </span>
        }
      >
        <span className="wfd-control wfd-control--mono">{'${{ inputs.change }}'}</span>
        <span className="wfd-note">The change ID</span>
      </Row>
      <Row k="Matrix">
        <span className="wfd-switch" />
      </Row>
      <Row k="On fail">
        <Select>None</Select>
      </Row>
      <div className="wfd-pcard__foot">
        <span className="wfd-remove">
          <Trash2 aria-hidden />
          Remove step
        </span>
      </div>
    </section>
  )
}

function Select({ children }: { children: ReactNode }) {
  return (
    <span className="wfd-control wfd-select">
      {children}
      <ChevronDown aria-hidden />
    </span>
  )
}
