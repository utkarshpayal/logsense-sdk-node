import os from "node:os";

export function getHostname() {
    return os.hostname();
}

export function now() {
    return new Date().toISOString();
}