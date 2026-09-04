#!/usr/bin/env python3
"""Remote deployment helper: run a command over SSH with password auth (paramiko).

Usage:
    python scripts/ssh_run.py "<command>"

Reads HOST / SSH_USER / SSH_PASSWORD / SSH_PORT from environment.
Accepts-and-stores the host key on first connect (stdout streamed live).
"""
import os
import sys
import paramiko

HOST = os.environ.get("SSH_HOST")
USER = os.environ.get("SSH_USER", "root")
PORT = int(os.environ.get("SSH_PORT", "22"))
PASSWORD = os.environ.get("SSH_PASSWORD")


def main() -> int:
    command = sys.argv[1] if len(sys.argv) > 1 else "echo connected; whoami; pwd"
    if not HOST or not PASSWORD:
        print("ERROR: SSH_HOST and SSH_PASSWORD env vars not set", file=sys.stderr)
        return 2

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(
            hostname=HOST,
            port=PORT,
            username=USER,
            password=PASSWORD,
            timeout=int(os.environ.get("SSH_TIMEOUT", "45")),
            banner_timeout=int(os.environ.get("SSH_BANNER_TIMEOUT", "45")),
            auth_timeout=int(os.environ.get("SSH_AUTH_TIMEOUT", "45")),
            look_for_keys=False,
            allow_agent=False,
        )
        stdin, stdout, stderr = client.exec_command(
            command, get_pty=True, timeout=None
        )
        # Stream stdout/stderr live, preserving partial lines.
        for line in iter(stdout.readline, ""):
            sys.stdout.write(line)
            sys.stdout.flush()
        exit_code = stdout.channel.recv_exit_status()
        # Drain any remaining stderr (get_pty merges, but be safe).
        rest_err = stderr.read().decode("utf-8", "replace")
        if rest_err:
            sys.stdout.write(rest_err)
            sys.stdout.flush()
        return exit_code
    finally:
        client.close()


if __name__ == "__main__":
    sys.exit(main())