/**
 * The bodies of the dashboard's HTTP API, declared once for the server and the client: each body is a zod schema and
 * its type is inferred from it. The client parses every answer it reads with its schema; the server imports this
 * module for its types only, so zod stays out of the CLI. It imports only zod and a type from a module with no `node:`
 * import, so the client bundle can import it.
 */
import { z } from "zod"
import type { ChangeTask } from "../core/change-text"

export type { ChangeTask } from "../core/change-text"

/** One task of a change; its shape is `ChangeTask` of core. */
export const ChangeTaskSchema = z.object({ text: z.string(), done: z.boolean() }) satisfies z.ZodType<ChangeTask>

/** The status of an active change, or `archived`. */
export const StatusSchema = z.enum(["invalid", "in-progress", "not-started", "ready", "archived"])
export type Status = z.infer<typeof StatusSchema>

/** One active change of `GET /api/projects/:key/changes`. */
export const ActiveChangeSchema = z.object({
  id: z.string(),
  description: z.string().nullable(),
  status: StatusSchema.exclude(["archived"]),
  done: z.number(),
  total: z.number(),
  issues: z.array(z.string()),
  updated: z.string(),
})
export type ActiveChange = z.infer<typeof ActiveChangeSchema>

/**
 * One archived change of `GET /api/projects/:key/changes`: `date` from its folder's name, `updated` the modification
 * time of its `change.yaml` (when it was archived, for a change left untouched since), which orders one day's archives.
 */
export const ArchivedChangeSchema = z.object({ dir: z.string(), id: z.string(), date: z.string(), updated: z.string() })
export type ArchivedChange = z.infer<typeof ArchivedChangeSchema>

/** The body of `GET /api/projects/:key/changes`: active by ID, archived newest first (by date, then by `updated`). */
export const ChangeListSchema = z.object({
  active: z.array(ActiveChangeSchema),
  archived: z.array(ArchivedChangeSchema),
})
export type ChangeList = z.infer<typeof ChangeListSchema>

/** One ordinal of a series. `archived` is the archive reference of an archived member, opaque to the client. */
export const SeriesMemberSchema = z.object({
  ordinal: z.string(),
  /** The member's change ID; for an empty ordinal, the ID it would have. */
  id: z.string(),
  active: z.string().nullable(),
  archived: z.string().nullable(),
  status: StatusSchema.nullable(),
  done: z.number().nullable(),
  total: z.number().nullable(),
})
export type SeriesMember = z.infer<typeof SeriesMemberSchema>

/** The body of `GET /api/projects/:key/changes/:id` and `…/changes/archive/:dir`. */
export const ChangeDetailSchema = z.object({
  id: z.string(),
  /** The date of an archived change, `null` when active. */
  archived: z.string().nullable(),
  /** The archive reference of an archived change (its `…/changes/archive/:dir`), `null` when active. */
  ref: z.string().nullable(),
  description: z.string().nullable(),
  status: StatusSchema,
  done: z.number(),
  total: z.number(),
  issues: z.array(z.string()),
  tasks: z.array(ChangeTaskSchema),
  /** The modification time of `change.yaml`, or of the folder when the file is missing, as an ISO string. */
  updated: z.string(),
  folder: z.string(),
  /** Each file's `version` (the SHA-256 of its bytes) on an active change only. */
  files: z.array(z.object({ name: z.string(), text: z.string(), version: z.string().optional() })),
  /** On an active change only: its `change.yaml`, `null` when it has none. */
  changeFile: z.object({ text: z.string(), version: z.string() }).nullable().optional(),
  series: z.object({ id: z.string(), members: z.array(SeriesMemberSchema) }).nullable(),
})
export type ChangeDetail = z.infer<typeof ChangeDetailSchema>

/** One row of `GET /api/workflows`. */
export const WorkflowRowSchema = z.object({
  name: z.string(),
  project: z.string().nullable(),
  description: z.string().nullable(),
  default: z.boolean(),
  steps: z.number().nullable(),
  runsOn: z.enum(["agents", "session", "mixed"]).nullable(),
  errors: z.array(z.string()),
})
export type WorkflowRow = z.infer<typeof WorkflowRowSchema>

/** The body of `GET /api/workflows`. */
export const WorkflowListSchema = z.object({ folder: z.string(), workflows: z.array(WorkflowRowSchema) })
export type WorkflowList = z.infer<typeof WorkflowListSchema>

/** One use of a prompt by a workflow file, as written. */
export const UseSchema = z.object({
  workflow: z.string(),
  project: z.string().nullable(),
  step: z.number(),
  as: z.enum(["step", "on-fail", "value"]),
})
export type Use = z.infer<typeof UseSchema>

/** One input of a prompt's header, in the header's order. */
export const PromptInputRowSchema = z.object({
  name: z.string(),
  required: z.boolean(),
  default: z.string().nullable(),
  description: z.string(),
})
export type PromptInputRow = z.infer<typeof PromptInputRowSchema>

/** One row of `GET /api/prompts`. */
export const PromptRowSchema = z.object({
  name: z.string(),
  project: z.string().nullable(),
  description: z.string().nullable(),
  model: z.string().nullable(),
  header: z.boolean(),
  inputs: z.array(PromptInputRowSchema),
  errors: z.array(z.string()),
  usedBy: z.array(UseSchema),
})
export type PromptRow = z.infer<typeof PromptRowSchema>

/** The body of `GET /api/prompts`. */
export const PromptListSchema = z.object({ folder: z.string(), prompts: z.array(PromptRowSchema) })
export type PromptList = z.infer<typeof PromptListSchema>

/** A check line of a file, with the line of the file it names (from 1), `null` when it names none. */
export const FileErrorSchema = z.object({ text: z.string(), line: z.number().nullable() })
export type FileError = z.infer<typeof FileErrorSchema>

/** The body of a file route. */
export const FileBodySchema = z.object({
  name: z.string(),
  project: z.string().nullable(),
  path: z.string(),
  text: z.string(),
  version: z.string(),
  errors: z.array(FileErrorSchema),
  usedBy: z.array(UseSchema).optional(),
})
export type FileBody = z.infer<typeof FileBodySchema>

/** The body of `POST /api/check`: the draft's lines, and for a prompt its header fields. */
export const CheckBodySchema = z.object({
  errors: z.array(FileErrorSchema),
  ...PromptRowSchema.pick({ header: true, description: true, model: true, inputs: true }).partial().shape,
})
export type CheckBody = z.infer<typeof CheckBodySchema>

/** One project of `GET /api/projects`: its key, label, number of active changes and folder (`null` when not found). */
export const ProjectSchema = z.object({
  key: z.string(),
  label: z.string(),
  active: z.number(),
  path: z.string().nullable(),
})
export type Project = z.infer<typeof ProjectSchema>

/** The body of `GET /api/projects`. */
export const ProjectListSchema = z.object({ projects: z.array(ProjectSchema), start: z.string().nullable() })
export type ProjectList = z.infer<typeof ProjectListSchema>

/** One version of `GET …/history`. */
export const VersionSchema = z.object({ id: z.string(), at: z.string(), added: z.number(), removed: z.number() })
export type Version = z.infer<typeof VersionSchema>

/** The body of `GET …/history`: the versions, newest first. */
export const VersionListSchema = z.object({ versions: z.array(VersionSchema) })
export type VersionList = z.infer<typeof VersionListSchema>

/** The body of `GET …/history/:id`. */
export const VersionTextSchema = z.object({ text: z.string() })
export type VersionText = z.infer<typeof VersionTextSchema>

/** The body of a successful write or restore: the file's new version. */
export const SavedSchema = z.object({ version: z.string() })
export type Saved = z.infer<typeof SavedSchema>

/** The body of an error answer. */
export const ErrorBodySchema = z.object({ error: z.string() })

/** Whether a list holds no value twice. */
const distinct = (values: string[]): boolean => new Set(values).size === values.length

/** An entry of the sidebar's `pinned` and `recent`: `project:<key>` or `group:<id>`. */
const SidebarIdSchema = z.string().regex(/^(?:project:.+|group:.{1,80})$/)

/** A hand-made group of the sidebar: its id, its name (trimmed) and the keys of its projects. */
export const DashboardGroupSchema = z.strictObject({
  id: z.string().min(1).max(80),
  name: z.string().trim().min(1).max(80),
  projects: z.array(z.string().min(1)),
})
export type DashboardGroup = z.infer<typeof DashboardGroupSchema>

/**
 * The body of `GET` and `PUT /api/dashboard`, kept in `<home>/dashboard.json`: the sidebar's pinned entries, its groups
 * (a project key in one group at most), the recently opened entries, newest first, and the dismissed grouping
 * suggestions' keys.
 */
export const DashboardSettingsSchema = z.strictObject({
  pinned: z.array(SidebarIdSchema).max(50).refine(distinct, "duplicate id"),
  groups: z
    .array(DashboardGroupSchema)
    .max(50)
    .refine((groups) => distinct(groups.map((g) => g.id)), "duplicate group id")
    .refine((groups) => distinct(groups.flatMap((g) => g.projects)), "a project key is in more than one group"),
  recent: z.array(SidebarIdSchema).max(10).refine(distinct, "duplicate id"),
  dismissed: z.array(z.string()).max(200),
})
export type DashboardSettings = z.infer<typeof DashboardSettingsSchema>
