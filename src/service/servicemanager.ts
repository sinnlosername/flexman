import {readFileSync, writeFileSync} from "fs";
import {JsonMap, parse as parseTOML, stringify as stringifyTOML} from "@iarna/toml";
import {Service} from "./service";
import {map as _map, uniq as _uniq, flatten as _flatten} from 'lodash';
import {HasToConfigObject, startEditor} from "../misc";
import {serviceConfigTemplate} from "../constants";
import {UserError} from "../error";

export class ServiceManager implements HasToConfigObject {
    private readonly configFile: string
    services: Service[]

    runningCache: Map<Service, boolean> = new Map()
    runningCacheExpire: number = 0

    constructor(configFile) {
        this.configFile = configFile;

        const configText: string = readFileSync(configFile, "utf8");
        const config = parseTOML(configText);

        this.services = _map(config, (serviceConfig, name) => new Service(name, this, serviceConfig));
    }

    resolveName(name: string): string[] {
        const resolvedNames = this.services
            .filter(service => name.toLowerCase().toLowerCase() === "all" || name === service.name)
            .map(service => service.name);

        if (resolvedNames.length === 0)
            throw new UserError(`Unable to resolve name '${name}'`);

        return resolvedNames;
    }

    resolveNames(names: string[]): string[] {
        return _uniq(_flatten(names.map(name => this.resolveName(name))));
    }

    getService(name: string) {
        return this.services.find(service => service.name === name);
    }

    getServices(names: string[]) {
        return names.map(name => this.getService(name));
    }

    saveConfig() {
        writeFileSync(this.configFile, stringifyTOML(this.toConfigObject()));
    }

    toConfigObject(): JsonMap {
        const result: JsonMap = {};
        this.services.forEach(service => result[service.name] = service.toConfigObject());
        return result;
    }

    edit(name: string) {
        const service = this.getService(name);
        const isNew = (service == null);
        const configText = isNew ? serviceConfigTemplate : stringifyTOML(service.toConfigObject());

        startEditor(configText, (edited: boolean, text: string) => {
            if (!edited) {
                console.log("No changes detected. Aborting...")
                return
            }

            const newService = new Service(name, this, parseTOML(text));
            if (isNew) {
                this.services.push(newService);
            } else {
                this.services[this.services.indexOf(service)] = newService;
            }

            this.saveConfig();
            console.log("Successfully saved service");
        });
    }

    removeService(name: string) {
        const service = this.getService(name)

        if (service == null) {
            throw new UserError("Service not found: ${name}")
        }

        this.services.splice(this.services.indexOf(service), 1)
        this.saveConfig()
    }
}