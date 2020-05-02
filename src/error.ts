export class UserError extends Error {
    constructor(message) {
        super(message);

        this.name = "UserError";
    }
}

export function handleProgramError(error: Error) {
    if (error instanceof UserError) {
        console.log(error.message);
    } else {
        console.error("An unexpected error occurred", error)
    }

    process.exit(process.env.LOCAL_TEST === "1" ? 0 : 1);
}

export class ConfigError extends UserError {
    constructor(message) {
        super(message);

        this.name = "ConfigError";
    }
}
