# theway

theway writes a spec and a numbered task list before any code, then implements the tasks in your session or through agents that open a reviewed, CI-green pull request.

The steps are yours: a workflow is a YAML file of steps, each run in your session or through agents, with review lenses, commit conventions and git host commands you can replace per project. See [Workflows](https://pixelfactoryio.github.io/theway/docs/concepts/workflows/).

![A Claude Code session: /theway:engineering writes the spec and tasks, then /theway:develop implements them](.github/demo.gif)

*Real Claude Code session on Sonnet, sped up. Idle waits shortened.*

## Install

```bash
npx --yes @pixelfactoryio/theway@latest install
```

Pin to a release:

```bash
npx --yes @pixelfactoryio/theway@X.Y.Z install
```

## Documentation

[pixelfactoryio.github.io/theway](https://pixelfactoryio.github.io/theway/)

## Requirements

- Node.js 22.12 or later
- macOS or Linux
- Claude Code

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT, see [LICENSE](LICENSE).
