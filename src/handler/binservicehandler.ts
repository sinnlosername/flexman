import {JsonMap} from "@iarna/toml";
import {ServiceHandler} from "./servicehandler";
import {Service} from "../service/service";
import {executeCommand, assignOnly, CommandResult} from "../misc";

export class BinServiceHandler implements ServiceHandler {
    protected static FIELDS: string[] = ["startCommand", "stopCommand", "killCommand", "isRunningCommand",
        "shell", "dir", "type"];

    type: string;
    startCommand: string;
    stopCommand: string
    killCommand: string
    isRunningCommand: string

    shell: string = "/bin/bash"
    dir: string = "."

    service: Service;

    constructor(service: Service, handlerConfig: JsonMap = {}) {
        this.service = service;

        assignOnly(this, handlerConfig, ...BinServiceHandler.FIELDS);
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

    toConfigObject(): JsonMap {
        return assignOnly(<JsonMap>{}, this, ...BinServiceHandler.FIELDS);
    }
}