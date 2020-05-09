import {ServiceManager} from "../service/servicemanager";
import {
    addCommandHandler,
    closeRedisClient, getRedisListEntries,
    KeyChannel,
    KeyKeepAlive, KeyStoppedServices,
    openRedisClient,
    subscribeChannel
} from "./watcher_redis";
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
        ]).then(this.ready.bind(this)).catch(handleProgramError)
    }

    private async ready() {
        addCommandHandler(this.subClient, "reload", this.handleReload.bind(this))
        addCommandHandler(this.subClient, "stop", this.handleStop.bind(this))
        await subscribeChannel(this.subClient, KeyChannel);

        process.on('SIGINT', () => this.handleStop());

        console.log("Watcher initialized! :)")
        setInterval(this.runLoop.bind(this), LoopInterval);
        this.runLoop(); // Initial call
    }

    private handleReload() {
        try {
            console.log("Reloading config...")
            this.serviceManager.reloadConfig();
            console.log("Config was reloaded")
        } catch (e) {
            console.error("Unable to reload config file", e)
        }
    }

    private handleStop() {
        this.pubClient.del(KeyKeepAlive);

        console.log("Received stop command. Exiting...");
        closeRedisClient(this.subClient);
        closeRedisClient(this.pubClient, true);
    }

    private async runLoop() {
        this.pubClient.set(KeyKeepAlive, String(Date.now()));
        const stoppedServices = getRedisListEntries(this.pubClient, KeyStoppedServices);



    }
}