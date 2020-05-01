export const serviceConfigTemplate = `description = ""    # A simple description
enabled = true      # If not enabled service will neither be restarted by watcher nor be able to be started from cli
shutdownSeconds = 5 # If service doesn't react to stop after n seconds, it will be killed

# If this field is not set, service will not be restarted by watcher
#restartSeconds = 10

    # Add envs if required
    #[envs]
    #  FOO = "BAR"

    [handler]
    # Both are optional. If not set the default values will be used
    #shell = "/bin/bash"
    #dir = "."

    # Uncomment the handler you want to use
    #type = "bin"
    #startCommand = ""     # Start the process
    #stopCommand = ""      # Stop the process gracefully
    #killCommand = ""      # Forcefully stop the process
    #isRunningCommand = "" # Should return exit code 0 if process is running, 1 if not

    #type = "tmux"
    #session = "" # Name of the tmux session
    #command = "" # Command executed in the tmux session
    #shutdownTrigger = "" # Inputs sent to the session in order to stop the service gracefully`