import {Command, program as cliCommand} from 'commander';
import {existsSync} from 'fs';
import {ServiceManager} from "./service/servicemanager";
import {ServiceStatus} from "./service/servicestatus";
import {handleProgramError, UserError} from "./error";
import {
    closeRedisClient,
    getWatcherStatus,
    openRedisClient,
    sendWatcherCommand,
    WatcherStatus
} from "./watcher/watcher_redis";
import {Watcher} from "./watcher/watcher";
import {executeCommand} from "./misc";
import {resolveConfigPath} from "./config";

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
  flex watcher status
  flex watcher reload
  flex watcher stop
*/

cliCommand
    .option("-c, --config <file>", "Specifies the config file")
    .option("-d, --delay <seconds>", 'Delay the command for n seconds', input => parseInt(input), 0);

cliCommand
    .command("start <name> ...")
    .alias("s")
    .description("start a service")
    .action(delayExecution(async (name : string, opts: Command) => {
        const redisClient = await openRedisClient();
        const services = serviceManager.getServices(serviceManager.resolveNames(opts.args));

        for (const service of services) {
            await service.start(redisClient);
        }

        closeRedisClient(redisClient, true);
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
        const redisClient = await openRedisClient();
        const services = serviceManager.getServices(serviceManager.resolveNames(opts.args));

        for (const service of services) {
            await service.stopOrKill(redisClient);
        }

        closeRedisClient(redisClient, true);
    }));

cliCommand
    .command("restart <name> ...")
    .alias("r")
    .description("restart a service")
    .action(delayExecution(async (name : string, opts: Command) => {
        const redisClient = await openRedisClient();
        const services = serviceManager.getServices(serviceManager.resolveNames(opts.args));

        for (const service of services) {
            await service.stopOrKill(redisClient);
            await service.start(redisClient);
        }

        closeRedisClient(redisClient, true);
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
    .alias("kgb")
    .description("Control the watcher service");

watcherCommand
    .command("start")
    .option("-D, --detach", "Start the watcher in the background (using tmux)")
    .description("Start the watcher service")
    .action(delayExecution(async (opts: Command) => {
        const redisClient = await openRedisClient();

        if (await getWatcherStatus(redisClient) === WatcherStatus.RUNNING) {
            console.log("The watcher service is already running");
            closeRedisClient(redisClient, true);
            return;
        }

        closeRedisClient(redisClient);

        if (!<boolean>opts.detach) {
            new Watcher(serviceManager)
            return;
        }

        const command = process.argv.join(" ").replace(" -D", "")
        const result = await executeCommand(`tmux new -d -s watcher '${command}'`, ".", "/bin/bash")

        if (result.exitCode !== 0) {
            // noinspection ExceptionCaughtLocallyJS
            throw new UserError(`Unable to start watcher service in background. Exit Code: ${result.exitCode}, ` +
                `Output: ${result.output}`)
        } else {
            console.log("Watcher service started in background. Use 'tmux a -t watcher' to attach");
            process.exit(0);
        }
    }))

watcherCommand
    .command("status")
    .description("Get the status of the watcher service")
    .action(delayExecution(async () => {
        const redisClient = await openRedisClient();
        const watcherStatus = await getWatcherStatus(redisClient);

        console.log(`The watcher service is currently ${WatcherStatus[watcherStatus].toLowerCase()}.`)
        closeRedisClient(redisClient, true);
    }))

watcherCommand
    .command("reload")
    .description("Reload the config file for the watcher service")
    .action(delayExecution(async () => await sendWatcherCommandIfRunning("reload")))

watcherCommand
    .command("stop")
    .description("Stop the watcher service")
    .action(delayExecution(async () => await sendWatcherCommandIfRunning("stop")))

async function sendWatcherCommandIfRunning(command: string): Promise<void> {
    const redisClient = await openRedisClient();

    if (await getWatcherStatus(redisClient) !== WatcherStatus.RUNNING) {
        console.log("The watcher service isn't running");
        closeRedisClient(redisClient, true);
        return;
    }

    await sendWatcherCommand(redisClient, {name: command, data: null});
    console.log(`Sent ${command} command to watcher service`);
    closeRedisClient(redisClient, true);
}

cliCommand
    .name("flex")
    .usage("<command> [options]")
    .version(process.env.npm_package_version);

cliCommand
    .parseAsync(process.argv)
    .then(afterParse)
    .catch(handleProgramError);

async function afterParse() {
    const configFile = cliCommand.config ?? resolveConfigPath();

    if (!existsSync(configFile)) {
        throw new UserError(`Config file '${configFile}' doesn't exist`);
    }

    serviceManager = new ServiceManager(configFile);
}

function delayExecution(callback: (...args: any[]) => Promise<void>) : (...args: any[]) => void {
    return (...args: any[]) => setTimeout(() => callback(...args).catch(handleProgramError), cliCommand.delay * 1000);
}