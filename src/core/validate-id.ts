const VERB = /^(add|update|refactor|remove)-/;
const KEBAB = /^(add|update|refactor|remove)-[a-z0-9]+(-[a-z0-9]+)*$/;
const SERIES = /^(add|update|refactor|remove)-[a-z0-9]+(-[a-z0-9]+)*-[0-9]{2}$/;

/** The text after the last hyphen (the whole id without one). */
const last = (id: string) => id.slice(id.lastIndexOf("-") + 1);

/** The reason an id breaks the verb-prefixed kebab-case grammar, "" when it fits. */
function formatReason(id: string): string {
  if (id === "") return "empty change id";
  if (/[A-Z]/.test(id)) return "uppercase letters are not allowed; use lowercase kebab-case";
  if (id.includes("_")) return "underscores are not allowed; use kebab-case (-)";
  if (!VERB.test(id)) return "must start with a verb prefix: add-, update-, refactor- or remove-";
  if (!KEBAB.test(id)) return "must be kebab-case: lowercase [a-z0-9] segments joined by single hyphens";
  return "";
}

export function standaloneReason(id: string): string {
  const reason = formatReason(id);
  if (reason !== "") return reason;
  if (/-[0-9]{2}$/.test(id)) return `ends in an ordinal (-${last(id)}) but is not a series member; drop it or pass --series`;
  if (/^[0-9]{1,2}$/.test(last(id))) {
    return `ends in a number (-${last(id)}); ordinals are only for series members (--series), as -NN`;
  }
  return "";
}

export function seriesReason(id: string): string {
  const reason = formatReason(id);
  if (reason !== "") return reason;
  if (/^[a-z]$/.test(last(id))) {
    return `letter suffix (-${last(id)}) is not allowed; series members end in a two-digit ordinal (-NN, e.g. -01)`;
  }
  if (!SERIES.test(id)) return "series member must end in a zero-padded two-digit ordinal (-NN, e.g. -01)";
  if (last(id) === "00") return "series ordinal must start at 01, not 00";
  const double = /-([0-9]{2})-[0-9]{2}$/.exec(id);
  if (double !== null) {
    return `double ordinal (-${double[1]}-${last(id)}); a series member carries exactly one -NN`;
  }
  return "";
}

export function cmdValidateId(id: string, series: boolean): number {
  const reason = series ? seriesReason(id) : standaloneReason(id);
  if (reason !== "") {
    const shown = id.replaceAll("\n", "\\n").replaceAll("\r", "\\r");
    process.stderr.write(`invalid change id '${shown}': ${reason}\n`);
    return 1;
  }
  return 0;
}
