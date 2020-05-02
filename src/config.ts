import {JsonMap} from "@iarna/toml";
import Joi, {ObjectSchema, SchemaMap} from "@hapi/joi";
import {ConfigError} from "./error";

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
        } else {
            return value;
        }
    }
}

