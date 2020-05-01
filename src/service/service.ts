import {JsonMap} from "@iarna/toml";
import {ServiceHandler} from "../handler/servicehandler";
import {BinServiceHandler} from "../handler/binservicehandler";
import {assignOnly, HasToConfigObject, sleep} from '../misc';
import {TmuxServiceHandler} from "../handler/tmuxservicehandler";
import {ServiceManager} from "./servicemanager";
import {ServiceStatus} from "./servicestatus";

export class Service implements HasToConfigObject {
    private static FIELDS: string[] = ["description", "enabled", "envs", "shutdownSeconds", "restartSeconds"];

    name: string
    description: string
    enabled: boolean

    envs: { [key: string]: string }
    shutdownSeconds: number
    restartSeconds: number

    handler: ServiceHandler
    manager: ServiceManager

    constructor(name: string, manager: ServiceManager, serviceConfig: JsonMap) {
        this.name = name;

        assignOnly(this, serviceConfig, ...Service.FIELDS);

        const handlerConfig = <JsonMap>serviceConfig.handler;
        const handlerType = <string>handlerConfig.type;

        switch (handlerType) {
            case "bin": {
                this.handler = new BinServiceHandler(this, handlerConfig);
                break
            }
            case "tmux": {
                this.handler = new TmuxServiceHandler(this, handlerConfig)
                break
            }
            default:
                throw new Error(`Unable to find handler for type '${handlerType}'`)
        }

        this.manager = manager;
    }

    async start() {
        try {
            if (await this.handler.isRunning(true)) {
                console.log(`Service ${this.name} already running`)
                return;
            }

            console.log(`Starting service: '${this.name}'`)
            const exitCode = await this.handler.start();

            if (!await this.handler.isRunning(true)) {
                console.log(`Unable to start service: '${this.name}', exit code: ${exitCode}`)
            } else {
                console.log(`Started service: '${this.name}'`)
            }
        } catch (e) {
            console.error(`Error while starting service: '${this.name}'`, e)
        }
    }

    async stopOrKill() {
        try {
            if (!await this.handler.isRunning(true)) {
                console.log(`Service '${this.name}' not running`)
                return;
            }

            console.log(`Stopping service: ${this.name}`)

            const exitCode = await this.handler.stop();

            let i;
            for (i = this.shutdownSeconds; i >= 0; i--) {
                await sleep(1000);
                if (!await this.handler.isRunning(true)) break;
            }

            // if i is >= 0 the shutdown await was cancelled early, which means it is already stopped
            if (i < 0 && await this.handler.isRunning(true)) {
                console.log(`Service '${this.name}' is still running after ${this.shutdownSeconds} seconds. `
                    + `Stop exited with code ${exitCode}. Killing it...`)
                await this.handler.kill();
                console.log(`Killed service: '${this.name}'`)
            } else {
                console.log(`Service stopped: '${this.name}'`)
            }
        } catch (e) {
            console.error(`Error while starting service: '${this.name}'`, e)
        }
    }

    async getStatus(): Promise<ServiceStatus> {
        if (!this.enabled)
            return ServiceStatus.DISABLED;

        return await this.handler.isRunning() ? ServiceStatus.RUNNING : ServiceStatus.STOPPED;
    }

    toConfigObject(): JsonMap {
        return assignOnly(<JsonMap>{handler: this.handler.toConfigObject()}, this, ...Service.FIELDS);
    }
}

