/** The theway command line: every subcommand with its arguments and flags. */
import { Command, InvalidArgumentError } from "commander";
import { cmdArchive } from "./core/archive";
import { cmdAuthority } from "./core/authority";
import { cmdChange, cmdTaskDone } from "./core/change";
import { cmdConfig } from "./core/config";
import { cmdContext } from "./core/context";
import { cmdDashboard } from "./core/dashboard";
import { cmdList } from "./core/list";
import { cmdNextId } from "./core/next-id";
import { cmdPath } from "./core/path";
import { cmdProject } from "./core/project";
import { cmdStandards } from "./core/standards";
import { cmdValidateId } from "./core/validate-id";
import { cmdWorkflow } from "./core/workflow";
import { install, uninstall } from "./install";

const nonEmpty = (value: string): string => {
  if (value === "") throw new InvalidArgumentError("must not be empty");
  return value;
};
const positive = (value: string): number => {
  if (!/^[1-9][0-9]*$/.test(value)) throw new InvalidArgumentError("must be a positive integer");
  return Number(value);
};
const portNumber = (value: string): number => {
  if (!/^[0-9]+$/.test(value) || Number(value) > 65535) throw new InvalidArgumentError("must be an integer from 0 to 65535");
  return Number(value);
};
const exit = (code: number): void => {
  process.exitCode = code;
};

export function buildProgram(): Command {
  const program = new Command("theway");
  program
    .command("install")
    .option("--home <path>", "", nonEmpty)
    .option("--standards <keys>")
    .action(async (o: { home?: string; standards?: string }) => exit(await install({ home: o.home, standards: o.standards })));
  program.command("uninstall").action(() => exit(uninstall()));
  program
    .command("list")
    .option("--project <key>")
    .action((o: { project?: string }) => exit(cmdList(o.project)));
  program
    .command("archive")
    .argument("<change-id>", "", nonEmpty)
    .option("--project <key>")
    .option("--force")
    .action((change: string, o: { project?: string; force?: boolean }) => exit(cmdArchive(change, o.project, o.force === true)));
  program
    .command("change")
    .argument("<change-id>", "", nonEmpty)
    .option("--project <key>")
    .action((change: string, o: { project?: string }) => exit(cmdChange(change, o.project)));
  program
    .command("task")
    .command("done")
    .argument("<change-id>", "", nonEmpty)
    .argument("<n...>")
    .option("--project <key>")
    .action((change: string, numbers: string[], o: { project?: string }) => exit(cmdTaskDone(change, numbers, o.project)));
  program
    .command("path")
    .argument("[change-id]")
    .option("--project <key>")
    .option("--verbose")
    .action((change: string | undefined, o: { project?: string; verbose?: boolean }) =>
      exit(cmdPath(change, o.project, o.verbose === true)),
    );
  program
    .command("project")
    .option("--project <key>")
    .action((o: { project?: string }) => exit(cmdProject(o.project)));
  program
    .command("config")
    .option("--project <key>")
    .action((o: { project?: string }) => exit(cmdConfig(o.project)));
  program
    .command("standards")
    .argument("<phase>")
    .option("--project <key>")
    .action((phase: string, o: { project?: string }) => exit(cmdStandards(phase, o.project)));
  program
    .command("context")
    .argument("<phase>")
    .argument("[change-id]")
    .option("--project <key>")
    .action((phase: string, change: string | undefined, o: { project?: string }) => exit(cmdContext(phase, change, o.project)));
  program
    .command("workflow")
    .argument("[name]")
    .option("--project <key>")
    .option("--input <name=value>", "", (value: string, previous: string[] | undefined) => [...(previous ?? []), value])
    .option("--compact")
    .action((name: string | undefined, o: { project?: string; input?: string[]; compact?: boolean }) =>
      exit(cmdWorkflow(name, o.project, o.input, o.compact === true)),
    );
  program
    .command("dashboard")
    .option("--port <n>", "", portNumber, 4870)
    .action(async (o: { port: number }) => exit(await cmdDashboard(o.port)));
  program.command("authority").action(() => exit(cmdAuthority()));
  program
    .command("next-id")
    .argument("<series-id>")
    .option("--project <key>")
    .option("--count <n>", "", positive, 1)
    .action((series: string, o: { project?: string; count: number }) => exit(cmdNextId(series, o.count, o.project)));
  program
    .command("validate-id")
    .argument("<id>")
    .option("--series")
    .action((id: string, o: { series?: boolean }) => exit(cmdValidateId(id, o.series === true)));
  return program;
}
