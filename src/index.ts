import {Command, program as cliCommand} from 'commander';
import {existsSync} from 'fs';
import {ServiceManager} from "./service/servicemanager";
import {ServiceStatus} from "./service/servicestatus";
import {handleProgramError, UserError} from "./error";

let serviceManager : ServiceManager;

/*
  parser.addFlag("startup", abbr: "s", negatable: false);
  parser.addFlag("status", abbr: "i", negatable: false);
  parser.addFlag("shutdown", abbr: "h", negatable: false);
  parser.addFlag("sure", negatable: false);

  parser.addOption("config", abbr: "c");
  parser.addOption("target", abbr: "t");
  parser.addOption("delay", abbr: "d");
  parser.addOption("watcher", abbr: "w");

  rman -s -t mcpublic

  flex start mcpublic
  flex start mcpublic reflexcloud

  flex config enable mcpublic
  flex config disable mcpublic
  flex config edit mcpublic

  flex watcher start
  flex watcher reload // auto reload?
  flex watcher stop
*/

cliCommand
    .option("-c, --config <file>", "Specifies the config file", "config.toml")
    .option("-d, --delay <seconds>", 'Delay the command for n seconds', input => parseInt(input), 0);

cliCommand
    .command("start <name> ...")
    .alias("s")
    .description("start a service")
    .action(delayExecution(async (name : string, opts: Command) => {
        const services = serviceManager.getServices(serviceManager.resolveNames(opts.args));

        for (const service of services) {
            await service.start();
        }
    }));

cliCommand
    .command("info <name> ...")
    .alias("i")
    .description("get the current status information about a service")
    .action(delayExecution(async (name : string, opts: Command) => {
        const names = serviceManager.resolveNames(opts.args);
        const services = serviceManager.getServices(names);
        const statusInfos: {name: string, status: ServiceStatus}[] = [];

        for (const service of services) {
            statusInfos.push({name: service.name, status: await service.getStatus()});
        }

        const longestName = names.reduce((a, b) => a.length > b.length ? a : b, '');
        const padding = Math.max(longestName.length + 2, 15)

        statusInfos
            .sort((a, b) => a.status - b.status)
            .forEach(statusInfo => {
                console.log(`${statusInfo.name.padEnd(padding)} ${ServiceStatus[statusInfo.status]}`);
            });
    }));

cliCommand
    .command("halt <name> ...")
    .alias("h")
    .alias("stop")
    .description("stop a service")
    .action(delayExecution(async (name : string, opts: Command) => {
        const services = serviceManager.getServices(serviceManager.resolveNames(opts.args));

        for (const service of services) {
            await service.stopOrKill();
        }
    }));

const configCommand = cliCommand
    .command("config")
    .alias("cfg")
    .description("configure services");

configCommand
    .command("enable <name>")
    .alias("en")
    .action(delayExecution(async (name: string) => {
        serviceManager.getServices(serviceManager.resolveName(name)).forEach(service => {
            service.enabled = true
            console.log(`Enabled: ${service.name}`)
        });

        serviceManager.saveConfig();
    }))

configCommand
    .command("disable <name>")
    .alias("dis")
    .action(delayExecution(async (name: string) => {
        serviceManager.getServices(serviceManager.resolveName(name)).forEach(service => {
            service.enabled = false
            console.log(`Disabled: ${service.name}`)
        });

        serviceManager.saveConfig();
    }))

configCommand
    .command("edit <name>")
    .action(delayExecution(async (name: string) => serviceManager.edit(name)));

configCommand
    .command("delete <name>")
    .alias("del")
    .action(delayExecution(async (name: string) => serviceManager.removeService(name)))

const watcherCommand = cliCommand
    .command("watcher")
    .alias("nsa")
    .description("Control the watcher service");

watcherCommand
    .command("start")
    .option("-D, --detach", "Start the watcher in the background (using tmux)")
    .description("Start the watcher service")

watcherCommand
    .command("stop")
    .description("Stop the watcher service")

cliCommand
    .name("flex")
    .usage("<command> [options]")
    .version(process.env.npm_package_version);

cliCommand
    .parseAsync(process.argv)
    .then(afterParse)
    .catch(handleProgramError);

async function afterParse() {
    const configFile = cliCommand.config;

    if (!existsSync(configFile)) {
        throw new UserError(`Config file '${configFile}' doesn't exist`);
    }

    serviceManager = new ServiceManager(configFile);
}

function delayExecution(callback: (...args: any[]) => Promise<void>) : (...args: any[]) => void {
    return (...args: any[]) => setTimeout(() => callback(...args).catch(handleProgramError), cliCommand.delay);
}
