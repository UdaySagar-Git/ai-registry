import { SCP_LOCATION } from "#adapter/location.ts";
import { isLocalPath } from "#adapter/paths.ts";

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const WEB = new Set(["http:", "https:"]);
const GIT = new Set(["ssh:", "git+ssh:", "ssh+git:", "git:"]);

/**
 * The origin a sign-in is bound to, compared as a browser compares them: scheme, lowercase
 * host, and a port only when it is not the default. A git address is its host over https.
 */
export function credentialOrigin(location: string): string | undefined {
  if (isLocalPath(location)) return undefined;
  const scheme = SCHEME.exec(location)?.[0].toLowerCase();
  if (scheme === undefined) {
    const scp = SCP_LOCATION.exec(location);
    if (scp !== null) return overHttps(scp[2] as string);
  }
  if (scheme === undefined) {
    // `github.com/acme/ai-registry`, as a person types a git address.
    const host = location.split("/")[0] ?? "";
    return host.includes(".") ? overHttps(host) : undefined;
  }
  let url: URL;
  try {
    url = new URL(location);
  } catch {
    return undefined;
  }
  if (url.hostname === "") return undefined;
  if (WEB.has(url.protocol)) return url.origin;
  if (GIT.has(url.protocol)) return overHttps(url.hostname);
  return `${url.protocol}//${url.host}`.toLowerCase();
}

function overHttps(host: string): string | undefined {
  try {
    const url = new URL(`https://${host}`);
    return url.hostname === "" ? undefined : url.origin;
  } catch {
    return undefined;
  }
}
