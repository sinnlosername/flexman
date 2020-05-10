import {join as joinPaths} from "path";
import {homedir} from "os";
import {existsSync, readFileSync} from "fs";
import {UserError} from "./error";

export interface RcConfig {
    CONFIG_PATH: string
}

export function getRcConfig(): RcConfig {
    const rcFile = joinPaths(homedir(), ".flexmanrc");
    if (!existsSync(rcFile)) {
        return null;
    }

    const config = {};
    const configText = readFileSync(rcFile, "utf8");
    for (let line of configText.split("\n")) {
        const keyValue = line.split("=");
        if (line.length === 0) continue
        if (keyValue.length !== 2) {
            throw new UserError("Invalid rc file. Syntax must be key=value")
        }

        config[keyValue[0]] = keyValue[1];
    }

    return <RcConfig>config;
}