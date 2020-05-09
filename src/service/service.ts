import {JsonMap} from "@iarna/toml";
import {ServiceHandler} from "../handler/servicehandler";
import {BinServiceHandler} from "../handler/binservicehandler";
import {assignOnly, sleep} from '../misc';
import {TmuxServiceHandler} from "../handler/tmuxservicehandler";
import {ServiceManager} from "./servicemanager";
import {ServiceStatus} from "./servicestatus";
import Joi from "@hapi/joi";
import {ConfigDefinition, HasConfigDefinition} from "../config";
import {RedisClient} from "redis";
import {addRedisListEntry, KeyStoppedServices, removeRedisListEntry} from "../watcher/watcher_redis";

export class Service implements HasConfigDefinition<Service> {
    //private static FIELDS: string[] = ["description", "enabled", "envs", "shutdownSeconds", "restartSeconds"];

    configDefinition: ConfigDefinition<Service> = new ConfigDefinition<Service>({
        description: Joi.string().required(),
        enabled: Joi.bool().required(),
        envs: Joi.object().unknown(true).optional(),
        shutdownSeconds: Joi.number().min(1).required(),
        restartSeconds: Joi.number().min(1).optional(),
        handler: Joi.object().keys({
            type: Joi.string().valid("bin", "tmux").required()
        }).unknown(true).required()
    });

    name: string
    description: string
    enabled: boolean

    envs: { [key: string]: string }
    shutdownSeconds: number
    restartSeconds: number

    handler: ServiceHandler<any>
    manager: ServiceManager

    constructor(name: string, manager: ServiceManager, serviceConfig: JsonMap) {
        this.name = name;

        this.configDefinition.fromConfigObject(this, serviceConfig);

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

    async start(client: RedisClient) {
        try {
            if (await this.handler.isRunning(true)) {
                console.log(`Service ${this.name} already running`)
                return;
            }

            console.log(`Starting service: '${this.name}'`)
            const exitCode = await this.handler.start();

            if (!await this.handler.isRunning(true)) {
                console.log(`Unable to start service: '${this.name}', exit code: ${exitCode}`)
                return;
            }

            console.log(`Started service: '${this.name}'`)
            await addRedisListEntry(client, KeyStoppedServices, name);
        } catch (e) {
            console.error(`Error while starting service: '${this.name}'`, e)
        }
    }

    async stopOrKill(client: RedisClient) {
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

            await removeRedisListEntry(client, KeyStoppedServices, name);
        } catch (e) {
            console.error(`Error while starting service: '${this.name}'`, e)
        }
    }

    async getStatus(): Promise<ServiceStatus> {
        if (!this.enabled)
            return ServiceStatus.DISABLED;

        return await this.handler.isRunning() ? ServiceStatus.RUNNING : ServiceStatus.STOPPED;
    }
}

