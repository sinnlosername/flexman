import {ServiceManager} from "../service/servicemanager";
import {
    addCommandHandler,
    closeRedisClient,
    getRedisListEntries,
    KeyChannel,
    KeyKeepAlive,
    KeyStoppedServices,
    openRedisClient,
    subscribeChannel
} from "./watcher_redis";
import {RedisClient} from "redis";
import {handleProgramError} from "../error";
import {values as _values} from 'lodash';
import {Service} from "../service/service";
import {ServiceStatus} from "../service/servicestatus";

export const LoopInterval = 1000;

export class Watcher {
    subClient: RedisClient
    pubClient: RedisClient

    serviceManager: ServiceManager
    scheduledForRestart: Service[] = []
    stoppedServices: string[] = []

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
        addCommandHandler(this.subClient, "update-stopped-services", this.handleUpdateStoppedServices.bind(this))

        await subscribeChannel(this.subClient, KeyChannel);

        process.on('SIGINT', () => this.handleStop());

        console.log("Watcher initialized! :)")
        this.printWatchedServices()

        this.stoppedServices = await getRedisListEntries(this.pubClient, KeyStoppedServices);

        setInterval(this.runLoopWithErrorHandling.bind(this), LoopInterval);
        this.runLoopWithErrorHandling(); // Initial call
    }

    private handleReload() {
        try {
            console.log("Reloading config...")
            this.serviceManager.reloadConfig();
            console.log("Config was reloaded")
            this.printWatchedServices();
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

    private handleUpdateStoppedServices() {
        getRedisListEntries(this.pubClient, KeyStoppedServices)
            .then(members => this.stoppedServices = members)
            .catch(handleProgramError)
    }

    private printWatchedServices() {
        console.log("The following services will be watched:")
        this.getWatchableService().forEach(service => {
            console.log(` => ${service.name} (restarts after ${service.restartSeconds})`)
        })
    }

    private runLoopWithErrorHandling() {
        this.runLoop().catch(handleProgramError)
    }

    private async runLoop() {
        this.pubClient.set(KeyKeepAlive, String(Date.now()));

        const services = this.getWatchableService()
            .filter(service => !this.stoppedServices.includes(service.name))
            .filter(service => this.scheduledForRestart.indexOf(service) === -1);

        this.serviceManager.runningCacheExpire = 0;
        for (const service of services) {
            if (await service.getStatus() === ServiceStatus.RUNNING) continue;
            if (this.stoppedServices.includes(service.name)) continue; // List might change while waiting for status

            console.log(`Service ${service.name} went offline. ` +
                `It will be restarted in ${service.restartSeconds} seconds.`);
            this.scheduledForRestart.push(service);

            setTimeout(async () => {
                // Services might have been started manually
                if (await service.getStatus() === ServiceStatus.RUNNING) return;
                await service.start(this.pubClient);
                this.scheduledForRestart.splice(this.scheduledForRestart.indexOf(service), 1);
            }, service.restartSeconds * 1000);
        }
    }

    private getWatchableService() {
        return (<Service[]>_values(this.serviceManager.services))
            .filter(service => service.enabled)
            .filter(service => service.restartSeconds != null)
            .filter(service => service.restartSeconds >= 0);
    }
}