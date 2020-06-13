import {Command, program as cliCommand} from 'commander';
import {convertConfig} from "./convert";
import fs, {readFileSync, writeFileSync} from "fs";
import {ServiceManager} from "../service/servicemanager";
import tmp, {FileResult} from "tmp";
import {handleProgramError, UserError} from "../error";

cliCommand
    .name("flex-import")
    .usage("<inputFile> [outputFile]")
    .action((command: Command, args: string[]) => {
        if (args == null || args.length < 1) {
            cliCommand.outputHelp();
            return;
        }

        if (!fs.existsSync(args[0])) {
            throw new UserError(`The provided file '${args[0]}' does not exist.`);
        }

        const config: string = convertConfig(JSON.parse(readFileSync(args[0], "utf8")));
        const configFile: FileResult = tmp.fileSync({mode: 0o660, keep: false});
        writeFileSync(configFile.fd, config, "utf8");

        try {
            new ServiceManager(configFile.name);
        } catch (e) {
            console.log(e);
            throw new UserError("The provided configuration could not be converted to a valid flexman config. See above for details");
        } finally {
            configFile.removeCallback();
        }

        const filePathToWriteTo = args[1] ?? "config.toml";

        writeFileSync(filePathToWriteTo, config, "utf8");
        console.log(`The configuration has been converted and written to ${filePathToWriteTo}`);
    });

cliCommand.parseAsync(process.argv)
    .catch(handleProgramError);