import {JsonMap, stringify as stringifyTOML} from "@iarna/toml";
import {forEach as _forEach} from 'lodash';

export function convertConfig(json: JsonMap[]): string {
    const services: JsonMap = {};

    json.forEach(element => {
        const service: JsonMap = {};

        service["description"] = element["description"];
        service["enabled"] = element["enabled"];
        service["shutdownSeconds"] = element["shutdownSeconds"];

        const restartSeconds: number = <number>element["restartSeconds"];
        const manual: boolean = <boolean>element["manual"] ?? false;

        if (restartSeconds != null && !manual)
            service["restartSeconds"] = restartSeconds;

        const handler: JsonMap = {};
        const handlerFromService: JsonMap = <JsonMap>element["handler"];

        if (handlerFromService["type"] === "TMUX") {
            handler["type"] = "tmux";
            handler["session"] = handlerFromService["session"];
            handler["command"] = handlerFromService["command"];
            handler["shutdownTrigger"] = handlerFromService["shutdownTrigger"];
            handler["shell"] = handlerFromService["shell"] ?? "/bin/bash";
            handler["dir"] = handlerFromService["dir"] ?? ".";
        } else if (handlerFromService["type"] === "BINARY") {
            handler["type"] = "bin";

            let dir: string = null;
            let shell: string = null;

            _forEach(handlerFromService, (handlerCommand, key) => {
                if (key === "type") return;

                handler[`${key}Command`] = handlerCommand["command"];

                if (dir == null && handlerCommand["dir"] != null)
                    dir = handlerCommand["dir"];
                if (shell == null && handlerFromService[key]["shell"] != null)
                    shell = handlerCommand["shell"];
            })

            handler["dir"] = dir ?? ".";
            handler["shell"] = shell ?? "/bin/bash";
        }

        service.handler = handler;

        service.envs = element["envs"];
        services[<string>element["name"]] = service;
    });

    return stringifyTOML({ services });
}
