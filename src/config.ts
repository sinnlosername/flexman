import {JsonMap} from "@iarna/toml";
import Joi, {ObjectSchema, SchemaMap} from "@hapi/joi";
import {ConfigError} from "./error";
import {mapValues as _mapValues} from 'lodash';
import {getRcConfig} from "./rcfile";

export interface HasConfigDefinition<Self extends HasConfigDefinition<Self>> {
    configDefinition: ConfigDefinition<Self>;
}

export class ConfigDefinition<ConfigObject extends HasConfigDefinition<ConfigObject>>  {
    fields: string[]
    schema: ObjectSchema

    constructor(schemaDefinition: SchemaMap) {
        this.schema = Joi.object().keys(schemaDefinition);
        this.fields = Object.keys(schemaDefinition);
    }

    validate(config: JsonMap) {
        const result = this.schema.validate(config);
        if (result.error != null) {
            throw new ConfigError(result.error);
        }
    }

    fromConfigObject(instance: ConfigObject, config: JsonMap) {
        this.validate(config);
        this.assign(instance, config);
    }

    toConfigObject(instance: ConfigObject): JsonMap {
        return this.assign(<JsonMap>{}, instance);
    }

    private assign<T extends object>(target: T, source: object): T {
        this.fields.forEach(field => {
            const value = source[field];

            if (value !== undefined) {
                target[field] = this.transform(source[field]);
            }
        });

        return target;
    }

    private transform(value: any): any {
        if (value.configDefinition instanceof ConfigDefinition) {
            return (<ConfigDefinition<any>>value.configDefinition).toConfigObject(value);
        } else if (Array.isArray(value)) {
            return value.map(entry => this.transform(entry));
        } else if (typeof value === "object") {
            return _mapValues(value, value => this.transform(value));
        } else {
            return value;
        }
    }
}

export function resolveConfigPath(): string {
    if (process.env["FLEXMAN_CONFIG_FILE"] != null) {
        return process.env["FLEXMAN_CONFIG_FILE"];
    }

    const rcConfig = getRcConfig();
    if (rcConfig != null && rcConfig.CONFIG_PATH != null) {
        return rcConfig.CONFIG_PATH;
    }

    return "./config.toml";
}

export const serviceConfigTemplate = `description = ""    # A simple description
enabled = true      # If not enabled service will neither be restarted by watcher nor be able to be started from cli
shutdownSeconds = 5 # If service doesn't react to stop after n seconds, it will be killed

# If this field is not set, service will not be restarted by watcher
#restartSeconds = 10

    # Add envs if required
    #[envs]
    #  FOO = "BAR"

    [handler]
    # Both are optional. If not set the default values will be used
    #shell = "/bin/bash"
    #dir = "."

    # Uncomment the handler you want to use
    #type = "bin"
    #startCommand = ""     # Start the process
    #stopCommand = ""      # Stop the process gracefully
    #killCommand = ""      # Forcefully stop the process
    #isRunningCommand = "" # Should return exit code 0 if process is running, 1 if not

    #type = "tmux"
    #session = "" # Name of the tmux session
    #command = "" # Command executed in the tmux session
    #shutdownTrigger = "" # Inputs sent to the session in order to stop the service gracefully`