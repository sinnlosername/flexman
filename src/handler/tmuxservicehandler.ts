import {BinServiceHandler} from "./binservicehandler";
import {JsonMap} from "@iarna/toml";
import {Service} from "../service/service";
import {closeSync, writeFileSync} from "fs";
import tmp from 'tmp';
import {map as _map} from 'lodash';
import {assignOnly, executeCommand, HasToConfigObject} from "../misc";

export class TmuxServiceHandler extends BinServiceHandler {
    protected static FIELDS: string[] = ["session", "command", "shutdownTrigger", "shell", "dir", "type"];

    session: string
    command: string
    shutdownTrigger: string

    constructor(service: Service, handlerConfig: JsonMap) {
        super(service);

        assignOnly(this, handlerConfig, ...TmuxServiceHandler.FIELDS);

        super.stopCommand = `tmux send -t ${this.session} ${this.shutdownTrigger}`;
        super.killCommand = `tmux kill-session -t ${this.session}`;
    }

    start(): Promise<number> {
        let fullCommand = this.command;

        if (this.service.envs != null && Object.keys(this.service.envs).length > 0) {
            const envFile = tmp.fileSync({mode: 0o600, prefix: 'env-', keep: true, detachDescriptor: true})
            writeFileSync(envFile.fd, _map(this.service.envs, (name, value) => name + "=" + value).join("\n"));
            closeSync(envFile.fd);

            fullCommand = `envfile='${envFile.name}'; . $envfile; rm -f $envfile; ${this.command}`;
        }

        return executeCommand(`tmux new -d -s ${this.session} '${fullCommand}'`, this.dir, this.shell)
            .then(result => result.exitCode);
    }

    async isRunning(clearCache?: boolean): Promise<boolean> {
        if (clearCache || this.service.manager.runningCacheExpire < Date.now()) {
            await this.updateRunningCache();
        }

        return this.service.manager.runningCache.get(this.service);
    }

    private async updateRunningCache() {
        const result = await executeCommand(`tmux ls`, this.dir, this.shell);
        const activeServices: string[] = result.output.split("\n")
            .map(line => line.split(":")[0])
            .filter(name => name.length > 0);

        this.service.manager.runningCache.clear();
        this.service.manager.services
            .filter(service => service.handler.type === "tmux")
            .forEach(service => {
                const tmuxHandler = (<TmuxServiceHandler>service.handler);
                this.service.manager.runningCache.set(service, activeServices.includes(tmuxHandler.session));
            });

        this.service.manager.runningCacheExpire = Date.now() + 5000;
    }

    toConfigObject(): JsonMap {
        return assignOnly(<JsonMap>{}, this, ...TmuxServiceHandler.FIELDS);
    }
}