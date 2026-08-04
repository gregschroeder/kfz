import appVersion from "./app-version.json";

/** Semver from app-version.json (major.minor manual; patch from deploy). */
export const APP_VERSION = `${appVersion.major}.${appVersion.minor}.${appVersion.patch}`;
