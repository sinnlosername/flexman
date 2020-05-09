import {ServiceManager} from "../service/servicemanager";
import {addCommandHandler, KeyChannel, KeyKeepAlive, openRedisClient, subscribeChannel} from "./watcher_redis";
import {RedisClient} from "redis";
import {handleProgramError} from "../error";

export const LoopInterval = 1000;

export class Watcher {
    subClient: RedisClient
    pubClient: RedisClient

    serviceManager: ServiceManager;

    constructor(serviceManager: ServiceManager) {
        this.serviceManager = serviceManager;

        Promise.all([
            openRedisClient().then(client => this.subClient = client),
            openRedisClient().then(client => this.pubClient = client)
        ]).then(async () => {
            addCommandHandler(this.subClient, "stop", this.handleStop)
            await subscribeChannel(this.subClient, KeyChannel);

            console.log("Watcher initialized! :)")
            setInterval(this.runLoop.bind(this), LoopInterval);
            this.runLoop(); // Initial call
        }).catch(handleProgramError)
    }

    private handleStop() {
        this.pubClient.set(KeyKeepAlive, null);

        console.log("Received stop command. Exiting...");
        process.exit(0);
    }

    private runLoop() {
        this.pubClient.set(KeyKeepAlive, String(Date.now()));
    }
}