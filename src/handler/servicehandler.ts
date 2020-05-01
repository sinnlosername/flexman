import {HasToConfigObject} from "../misc";

export interface ServiceHandler extends HasToConfigObject {
    type: string
    dir: string

    start(): Promise<number>;
    stop(): Promise<number>;
    kill(): Promise<number>;

    isRunning(refreshCache?: boolean): Promise<boolean>;
}
