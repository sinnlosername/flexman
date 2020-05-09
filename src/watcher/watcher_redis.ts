import {createClient, RedisClient} from "redis";
import {LoopInterval} from "./watcher";

export interface WatcherCommand {
    name: string,
    data: object
}
export type WatcherCommandHandler = (command: WatcherCommand) => void;

export const RedisPrefix = "flexman:watcher"
export const KeyKeepAlive = `${RedisPrefix}:keepAlive`
export const KeyChannel = `${RedisPrefix}:channel`
export const KeyStoppedServices = `${RedisPrefix}:stoppedServices`

export function openRedisClient(): Promise<RedisClient> {
    return new Promise<RedisClient>((resolve, reject) => {
        const client = createClient();

        client.on("error", reject);
        client.ping(err => (err != null ? reject(err) : resolve(client)));
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
        client.publish(KeyChannel, JSON.stringify(command), (err) => (err != null ? reject(err) : resolve()));
    })
}

export async function getWatcherStatus(client: RedisClient): Promise<WatcherStatus> {
    return new Promise((resolve, reject) => {
        client.get(KeyKeepAlive, (err, value) => {
            if (err != null) {
                reject(err);
                return
            }

            if (value == null) {
                resolve(WatcherStatus.STOPPED)
                return;
            }

            resolve( parseInt(value) + LoopInterval + 1000 > Date.now() ? WatcherStatus.RUNNING : WatcherStatus.DEAD);
        });
    })
}

export async function subscribeChannel(client: RedisClient, channel: string): Promise<void> {
    return new Promise((resolve, reject) => {
        client.subscribe(channel, (err: Error) => (err != null ? reject(err) : resolve()));
    })
}

export async function addRedisListEntry(client: RedisClient, key: string, value: string): Promise<void> {
    return new Promise((resolve, reject) => {
        client.sadd(key, value, (err: Error) => (err != null ? reject(err) : resolve()));
    });
}

export async function removeRedisListEntry(client: RedisClient, key: string, value: string): Promise<void> {
    return new Promise((resolve, reject) => {
        client.srem(key, value, (err: Error) => (err != null ? reject(err) : resolve()));
    });
}

export async function getRedisListEntries(client: RedisClient, key: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
        client.smembers(key, (err, members) => (err != null ? reject(err) : resolve(members)));
    });
}

export enum WatcherStatus {
    RUNNING,
    STOPPED, // Watcher was stopped using 'stop' command
    DEAD// Watcher crashed / was killed
}

export function closeRedisClient(client: RedisClient, exitProcess: boolean = false) {
    client.end(true);
    if (exitProcess) {
        process.exit(0);
    }
}