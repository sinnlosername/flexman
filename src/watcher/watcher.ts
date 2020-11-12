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
import {values as _values, debounce as _debounce} from 'lodash';
import {Service} from "../service/service";
import {ServiceStatus} from "../service/servicestatus";
import {watch as fsWatch, statSync as fsStatSync, existsSync as fsExistsSync, FSWatcher} from "fs";
import {join as pathJoin} from "path";

export const LoopInterval = 1000;

export class Watcher {
    subClient: RedisClient
    pubClient: RedisClient

    serviceManager: ServiceManager
    scheduledForRestart: Service[] = []
    stoppedServices: string[] = []

    fileWatchers: FSWatcher[] = []

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

        this.initFileWatchers();
        this.printWatchedServices();

        this.stoppedServices = await getRedisListEntries(this.pubClient, KeyStoppedServices);

        setInterval(this.runLoopWithErrorHandling.bind(this), LoopInterval);
        console.log("Watcher initialized! :)");

        this.runLoopWithErrorHandling(); // Initial call
    }

    private handleReload() {
        try {
            console.log("Reloading config...")
            this.serviceManager.reloadConfig();
            console.log("Config was reloaded")

            this.stopFileWatchers();
            this.initFileWatchers();

            this.printWatchedServices();
        } catch (e) {
            console.error("Unable to reload config file", e)
        }
    }

    private handleStop() {
        this.pubClient.del(KeyKeepAlive);

        console.log("Received stop command. Exiting...");
        this.stopFileWatchers();
        closeRedisClient(this.subClient);
        closeRedisClient(this.pubClient, true);
    }

    private handleUpdateStoppedServices() {
        getRedisListEntries(this.pubClient, KeyStoppedServices)
            .then(members => this.stoppedServices = members)
            .catch(handleProgramError)
    }

    private printWatchedServices() {
        const servicesWithCrashWatcher = this.getServicesWithCrashWatcher();
        if (servicesWithCrashWatcher.length > 0) {
            console.log("The following services will be watched for restart on crash:")
            this.getServicesWithCrashWatcher().forEach(service => {
                console.log(` => ${service.name} (restarts after ${service.restartSeconds})`)
            })
        }

        const servicesWithFileWatcher = this.getServicesWithFileWatcher();
        if (servicesWithFileWatcher.length > 0) {
            console.log("The following files will be watched for restart on file change:")
            this.getServicesWithFileWatcher().forEach(service => {
                const fullPath = pathJoin(service.handler.dir, service.restartOnChange);
                console.log(` => ${service.name} (watches: ${fullPath})`)
            })
        }
    }

    private runLoopWithErrorHandling() {
        this.runLoop().catch(handleProgramError)
    }

    private async runLoop() {
        this.pubClient.set(KeyKeepAlive, String(Date.now()));

        const services = this.getServicesWithCrashWatcher()
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
                await service.start(this.pubClient, true);
                this.scheduledForRestart.splice(this.scheduledForRestart.indexOf(service), 1);
            }, service.restartSeconds * 1000);
        }
    }

    private getServicesWithCrashWatcher() {
        return (<Service[]>_values(this.serviceManager.services))
            .filter(service => service.enabled)
            .filter(service => service.restartSeconds != null)
            .filter(service => service.restartSeconds >= 0);
    }

    private initFileWatchers(): void {
        this.getServicesWithFileWatcher().forEach(service => {
            const filePath = pathJoin(service.handler.dir, service.restartOnChange);

            if (!fsExistsSync(filePath)) {
                console.error(`File for restart-on-change doesn't exist: ${filePath}`)
                return;
            }

            let restartPromise;
            let previousLastModify = fsStatSync(filePath).mtimeMs;

            const fileWatcher = fsWatch(filePath, _debounce(async () => {
                if (restartPromise != null) {
                    console.warn("File for restart-on-change was modified while restarting. No additional restart will be triggered");
                    return;
                }

                if (!fsExistsSync(filePath)) {
                    console.error(`File for restart-on-change doesn't exist anymore: ${filePath}`);
                    previousLastModify = null;
                    return;
                }

                const currentLastModify = fsStatSync(filePath).mtimeMs;
                if (previousLastModify != null && currentLastModify <= previousLastModify) return; // File didn't change

                previousLastModify = currentLastModify;
                console.log(`Watched file for service ${service.name} changed. It will be restarted now.`);

                restartPromise = service.stopOrKill(this.pubClient)
                    .then(() => service.start(this.pubClient))
                    .catch(e => console.error(`File watcher failed tor restart service: ${service.name}`, e))
                    .finally(() => restartPromise = null);
            }, 1500));

            this.fileWatchers.push(fileWatcher);
        })
    }

    private stopFileWatchers(): void {
        this.fileWatchers.forEach(fileWatcher => fileWatcher.close());
        this.fileWatchers.length = 0; // Clear the array
    }

    private getServicesWithFileWatcher() {
        return (<Service[]>_values(this.serviceManager.services))
            .filter(service => service.enabled)
            .filter(service => service.restartOnChange != null);
    }
}