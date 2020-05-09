import {createClient, RedisClient} from "redis";
import {LoopInterval} from "./watcher";

export interface WatcherCommand {
    name: string,
    data: object
}
export type WatcherCommandHandler = (command: WatcherCommand) => void;

export const RedisPrefix = "flexman:watcher:"
export const KeyKeepAlive = `${RedisPrefix}:keepAlive`
export const KeyChannel = `${RedisPrefix}:channel`

export function openRedisClient(): Promise<RedisClient> {
    return new Promise<RedisClient>((resolve, reject) => {
        const client = createClient();

        client.on("error", reject);
        client.ping(err => {
            if (err != null) {
                reject(err)
            } else {
                resolve(client);
            }
        });
    });
}

export function addCommandHandler(client: RedisClient, commandName: string, handler: WatcherCommandHandler) {
    client.on("message", (channel, message) => {
        if (channel !== KeyChannel) return;

        const command = <WatcherCommand>JSON.parse(message);

        if (command.name === commandName) {
            handler(command);
        }
    })
}

export async function sendWatcherCommand(client: RedisClient, command: WatcherCommand): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        client.publish(KeyChannel, JSON.stringify(command), (err) => {
            if (err != null) {
                reject(err)
            } else {
                resolve();
            }
        });
    })
}

export async function isWatcherRunning(client: RedisClient): Promise<boolean> {
    return new Promise((resolve, reject) => {
        client.get(KeyKeepAlive, (err, value) => {
            if (err != null) {
                reject(err);
                return
            }

            resolve(value != null && parseInt(value) + LoopInterval + 1000 > Date.now());
        });
    })
}