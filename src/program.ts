/** The theway command line: every subcommand with its arguments and flags. */
import { Command, InvalidArgumentError } from "commander";
import { cmdArchive } from "./core/archive";
import { cmdList } from "./core/list";
import { cmdValidateId } from "./core/validate-id";
import { install, uninstall } from "./install";

const nonEmpty = (value: string): string => {
  if (value === "") throw new InvalidArgumentError("must not be empty");
  return value;
};
const exit = (code: number): void => {
  process.exitCode = code;
};

export function buildProgram(): Command {
  const program = new Command("theway");
  program.command("install").action(() => exit(install()));
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
    .command("validate-id")
    .argument("<id>")
    .option("--series")
    .action((id: string, o: { series?: boolean }) => exit(cmdValidateId(id, o.series === true)));
  return program;
}
