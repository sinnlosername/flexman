import {JsonMap} from "@iarna/toml";
import {ServiceHandler} from "./servicehandler";
import {Service} from "../service/service";
import {executeCommand, CommandResult} from "../misc";
import {ConfigDefinition} from "../config";
import Joi from "@hapi/joi";

export class BinServiceHandler implements ServiceHandler<BinServiceHandler> {
    configDefinition: ConfigDefinition<BinServiceHandler> = new ConfigDefinition<BinServiceHandler>({
        type: Joi.string().valid("bin").required(),
        startCommand: Joi.string().required(),
        stopCommand: Joi.string().required(),
        killCommand: Joi.string().required(),
        isRunningCommand: Joi.string().required(),

        shell: Joi.string().optional(),
        dir: Joi.string().optional(),
    });

    type: string;
    startCommand: string;
    stopCommand: string
    killCommand: string
    isRunningCommand: string

    shell: string = "/bin/bash"
    dir: string = "."

    service: Service;

    constructor(service: Service, handlerConfig: JsonMap) {
        this.service = service;

        if (handlerConfig != null) {
            this.configDefinition.fromConfigObject(this, handlerConfig);
        }
    }

    isRunning(clearCache?: boolean): Promise<boolean> {
        return this.executeHandlerCommand(this.isRunningCommand, true).then(result => result.exitCode === 0);
    }

    start(): Promise<number> {
        return this.executeHandlerCommand(this.startCommand).then(result => result.exitCode);
    }

    stop(): Promise<number> {
        return this.executeHandlerCommand(this.stopCommand).then(result => result.exitCode);
    }

    kill(): Promise<number> {
        return this.executeHandlerCommand(this.killCommand).then(result => result.exitCode);
    }

    private executeHandlerCommand(command: string, envs: boolean = false): Promise<CommandResult> {
        return executeCommand(command, this.dir, this.shell, envs ? this.service.envs : undefined);
    }
}

