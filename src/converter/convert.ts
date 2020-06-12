import {JsonMap, stringify as stringifyTOML} from "@iarna/toml";

export function convertConfig(json: any[]): string {
    const newConfig: JsonMap = {};
    newConfig.services = {};

    for (const element of json) {
        const service: JsonMap = {};

        service["description"] = element["description"];
        service["enabled"] = element["enabled"];
        service["shutdownSeconds"] = element["shutdownSeconds"];

        const restartSeconds: number = element["restartSeconds"];
        const manual: boolean = element["manual"] ?? false;

        if (restartSeconds != null && !manual)
            service["restartSeconds"] = restartSeconds;

        const handler: JsonMap = {};
        const handlerFromService: JsonMap = element["handler"];

        if (handlerFromService["type"] === "TMUX") {
            handler["type"] = "tmux";
            handler["session"] = handlerFromService["session"];
            handler["command"] = handlerFromService["command"];
            handler["shutdownTrigger"] = handlerFromService["shutdownTrigger"];
            handler["shell"] = handlerFromService["shell"] ?? "/bin/bash";
            handler["dir"] = handlerFromService["dir"] ?? ".";
        } else if (handlerFromService["type"] === "BINARY") {
            handler["type"] = "bin";
            let dir: string;
            let shell: string;
            Object.keys(handlerFromService).forEach(key => {
                if (key === "type")
                    return;

                handler[`${key}Command`] = handlerFromService[key]["command"];

                if (dir == null && handlerFromService[key]["dir"] != null)
                    dir = handlerFromService[key]["dir"];
                if (shell == null && handlerFromService[key]["shell"] != null)
                    shell = handlerFromService[key]["shell"];
            });

            handler["dir"] = dir ?? ".";
            handler["shell"] = shell ?? "/bin/bash";
        }

        service.handler = handler;

        if (element["envs"] != null) {
            const envs: JsonMap = {};
            Object.keys(element["envs"]).forEach(key => {
                envs[key] = element["envs"][key];
            });
            service.envs = envs;
        }

        newConfig.services[element["name"]] = service;
    }

    return stringifyTOML(newConfig);
}

