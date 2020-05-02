import {readFileSync, writeFileSync} from "fs";
import {JsonMap, parse as parseTOML, stringify as stringifyTOML} from "@iarna/toml";
import {Service} from "./service";
import {flatten as _flatten, values as _values, mapValues as _mapValues, uniq as _uniq} from 'lodash';
import {startEditor} from "../misc";
import {serviceConfigTemplate} from "../constants";
import {UserError} from "../error";
import {ConfigDefinition, HasConfigDefinition} from "../config";
import Joi from "@hapi/joi";

type ServiceMap = { [key: string]: Service }

export class ServiceManager implements HasConfigDefinition<ServiceManager> {
    configDefinition: ConfigDefinition<ServiceManager> = new ConfigDefinition<ServiceManager>({
        services: Joi.object().required()
    });

    private readonly configFile: string
    services: ServiceMap

    runningCache: Map<Service, boolean> = new Map()
    runningCacheExpire: number = 0

    constructor(configFile) {
        this.configFile = configFile;

        const configText: string = readFileSync(configFile, "utf8");
        const config = parseTOML(configText);

        this.configDefinition.validate(config);

        this.services = _mapValues(<JsonMap>config.services, (serviceConfig, name) => {
            return new Service(name, this, serviceConfig)
        })
    }

    resolveName(name: string): string[] {
        const resolvedNames = _values(this.services)
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
        return this.services[name];
    }

    getServices(names: string[]) {
        return names.map(name => this.getService(name));
    }

    saveConfig() {
        writeFileSync(this.configFile, stringifyTOML(this.configDefinition.toConfigObject(this)));
    }

    edit(name: string) {
        const service = this.getService(name);
        const isNew = (service == null);
        const configText = isNew ? serviceConfigTemplate : stringifyTOML(service.configDefinition.toConfigObject(service));

        startEditor(configText, (edited: boolean, text: string) => {
            if (!edited) {
                console.log("No changes detected. Aborting...")
                return
            }

            this.services[name] = new Service(name, this, parseTOML(text));

            this.saveConfig();
            console.log("Successfully saved service");
        });
    }

    removeService(name: string) {
        const service = this.getService(name)

        if (service == null) {
            throw new UserError("Service not found: ${name}")
        }

        delete this.services[service.name];
        this.saveConfig()
    }
}