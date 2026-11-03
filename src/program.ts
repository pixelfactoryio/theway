/** The theway command line: every subcommand with its arguments and flags. */
import { Command, InvalidArgumentError } from "commander";
import { cmdArchive } from "./core/archive";
import { cmdAuthority } from "./core/authority";
import { cmdConfig } from "./core/config";
import { cmdContext } from "./core/context";
import { cmdList } from "./core/list";
import { cmdNextId } from "./core/next-id";
import { cmdPath } from "./core/path";
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
    .argument("<project>", "", nonEmpty)
    .action((project: string) => exit(cmdList(project)));
  program
    .command("archive")
    .argument("<project>", "", nonEmpty)
    .argument("<change-id>", "", nonEmpty)
    .option("--force")
    .action((project: string, change: string, o: { force?: boolean }) => exit(cmdArchive(project, change, o.force === true)));
  program
    .command("path")
    .argument("[project]")
    .argument("[change-id]")
    .option("--verbose")
    .action((project: string | undefined, change: string | undefined, o: { verbose?: boolean }) =>
      exit(cmdPath(project, change, o.verbose === true)),
    );
  program
    .command("config")
    .argument("<project>")
    .action((project: string) => exit(cmdConfig(project)));
  program
    .command("standards")
    .argument("<project>")
    .argument("<phase>")
    .action((project: string, phase: string) => exit(cmdStandards(project, phase)));
  program
    .command("context")
    .argument("<project>")
    .argument("<phase>")
    .argument("[change-id]")
    .action((project: string, phase: string, change: string | undefined) => exit(cmdContext(project, phase, change)));
  program
    .command("workflow")
    .argument("<project>")
    .argument("[name]")
    .action((project: string, name: string | undefined) => exit(cmdWorkflow(project, name)));
  program.command("authority").action(() => exit(cmdAuthority()));
  program
    .command("next-id")
    .argument("<project>")
    .argument("<series-id>")
    .option("--count <n>", "", positive, 1)
    .action((project: string, series: string, o: { count: number }) => exit(cmdNextId(project, series, o.count)));
  program
    .command("validate-id")
    .argument("<id>")
    .option("--series")
    .action((id: string, o: { series?: boolean }) => exit(cmdValidateId(id, o.series === true)));
  return program;
}
