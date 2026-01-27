@echo off
echo yes | "C:\Program Files\Git\usr\bin\ssh.exe" -T git@ssh.github.com -p 443 -o StrictHostKeyChecking=no
"C:\Program Files\Git\bin\git.exe" push
