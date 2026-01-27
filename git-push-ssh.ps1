$env:GIT_SSH_COMMAND = "ssh -i C:/Users/Administrator/.ssh/id_ed25519 -o StrictHostKeyChecking=no -o UserKnownHostsFile=NUL"
& "C:\Program Files\Git\bin\git.exe" push
