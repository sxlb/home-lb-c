#!/usr/bin/env python3
"""Upload + extract source tarball to remote and snapshot prod DB.

Usage:
    python scripts/ssh_sync.py <local_tar> <remote_tar_path> <project_dir>

Connects with password auth (SSH_HOST/SSH_USER/SSH_PASSWORD/SSH_PORT env).
Uploads <local_tar>, extracts it over <project_dir>, and snapshots
<project_dir>/data/prod.db to project_dir/../prod-backup-<ts>.db as a safety net.
"""
import os
import sys
import time
import paramiko


def main() -> int:
    local_tar = sys.argv[1]
    remote_tar = sys.argv[2]
    project = sys.argv[3]

    host = os.environ.get("SSH_HOST")
    user = os.environ.get("SSH_USER", "root")
    port = int(os.environ.get("SSH_PORT", "22"))
    password = os.environ.get("SSH_PASSWORD")
    if not host or not password:
        print("ERROR: SSH_HOST and SSH_PASSWORD env vars not set", file=sys.stderr)
        return 2

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(
            hostname=host, port=port, username=user, password=password,
            timeout=30, banner_timeout=30, auth_timeout=30,
            look_for_keys=False, allow_agent=False,
        )
        sftp = client.open_sftp()
        size = os.path.getsize(local_tar)
        print(f"[sftp] uploading {local_tar} ({size} B) -> {remote_tar}")
        sftp.put(local_tar, remote_tar)
        sftp.close()

        stamp = time.strftime("%Y%m%d-%H%M%S")
        script = (
            f"cd {project} && "
            f"tar -xzf {remote_tar} && "
            f"cp data/prod.db ../prod-backup-{stamp}.db 2>/dev/null && "
            f"echo 'BACKUP_OK ../prod-backup-{stamp}.db' || echo 'NO_DB'"
        )
        _, stdout, stderr = client.exec_command(script, get_pty=True)
        for line in iter(stdout.readline, ""):
            sys.stdout.write(line); sys.stdout.flush()
        rc = stdout.channel.recv_exit_status()
        err = stderr.read().decode("utf-8", "replace")
        if err:
            sys.stdout.write(err); sys.stdout.flush()
        if rc == 0:
            print("[sync] extract + backup OK")
        return rc
    finally:
        client.close()


if __name__ == "__main__":
    sys.exit(main())