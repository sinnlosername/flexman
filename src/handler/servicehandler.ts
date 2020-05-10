import {HasConfigDefinition} from "../config";


export interface ServiceHandler<Self extends ServiceHandler<Self>> extends HasConfigDefinition<Self> {
    type: string
    dir: string

    start(): Promise<number>;
    stop(): Promise<number>;
    kill(): Promise<number>;

    isRunning(refreshCache?: boolean): Promise<boolean>;
}
