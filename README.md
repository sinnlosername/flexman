Flexman is an even simpler service manager written in NodeJS/Typescript.

Created with ❤️ in Austria. Licensed under MIT.

# Requirements
- NodeJS 14+
- Redis Server
- Git (for installation)

# Installation
1. Clone repository using `git pull`
2. Run `npm install -g`. After this the `flex` command should be available in the path.
3. Create a `config.toml` file. Flexman will check for the config in the following locations in this priority
- The path specified in the `FLEXMAN_CONFIG_FILE` environment variable
- The path specified as `CONFIG_PATH` in the `~/.flexmanrc` file
- `config.toml` in the current directory
