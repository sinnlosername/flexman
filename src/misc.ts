import {spawn} from "child_process";
import {JsonMap} from "@iarna/toml";
import {closeSync, existsSync, readFileSync, readSync, statSync, writeFileSync} from "fs";
import tmp from "tmp";
import {join} from "path";

const editors: string[] = [
    "/bin/nano",
    "/usr/bin/vim",
    "/usr/bin/vi"
];

export interface CommandResult {
    exitCode: number,
    output: string
}

export async function sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

export function executeCommand(command: string, dir: string, shell: string, envs?: { [key: string]: string })
    : Promise<CommandResult> {

    if (process.env["flex_debug_cmd"] === "1") {
        console.debug(`executeCommand(${command}, ${dir}, ${shell}, ${envs})`)
    }

    return new Promise<{ exitCode: number, output: string }>((resolve, reject) => {
        const process = spawn(command, {
            shell,
            cwd: dir,
            env: envs
        });

        let output = '';

        process.stdout.on('data', data => output += data.toString());
        process.stderr.on('data', data => output += data.toString());

        process.on('error', reject)
        process.on('exit', exitCode => resolve({exitCode, output}));
    });
}

export function assignOnly<T extends object>(target: T, source: object, ...names: string[]): T {
    names.filter(name => source[name] != undefined).forEach(name => target[name] = source[name]);
    return target;
}

export interface HasToConfigObject {
    toConfigObject(): JsonMap
}

export function startEditor(text: string, callback: (edited: boolean, text: string) => void) {
    const envFile = tmp.fileSync({mode: 0o600, prefix: 'edit-', detachDescriptor: true});
    try {
        writeFileSync(envFile.name, text);
    } finally {
        closeSync(envFile.fd);
    }

    const preStat = statSync(envFile.name);
    const editorSpawn = require('child_process').spawn(getEditorPath(), [envFile.name], {
        stdio: 'inherit'
    });

    editorSpawn.on('data', function (data) {
        process.stdout.pipe(data);
    });

    editorSpawn.on('exit', function (data) {
        const postStat = statSync(envFile.name);
        const text = readFileSync(envFile.name, 'utf-8');
        envFile.removeCallback();

        callback(postStat.mtime > preStat.mtime, text);
    });
}

function getEditorPath(): string {
    return [process.env.VISUAL, ...editors].find(path => path != null && existsSync(path));
}