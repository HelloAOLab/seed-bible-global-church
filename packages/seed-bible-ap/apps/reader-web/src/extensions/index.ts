// THE BUILT-IN EXTENSIONS, registered at boot; each is on by default and can be turned off in the account pane.
// Ported here as intent emitters (docs/porting/ExtensionManager.md); the ones that need a credential or an org
// publisher (external MCP acts, Apologist) are not here.
import type { ExtensionHost } from "./host";
import compare from "./compare";
import references from "./references";
import locations from "./locations";
import companion from "./companion";
import twitch from "./twitch";
import transcript from "./transcript";
import defaultContent from "./defaultContent";
import theographic from "./theographic";
import interpretations from "./interpretations";

export function registerBuiltInExtensions(host: ExtensionHost) {
  for (const ext of [
    compare,
    references,
    locations,
    companion,
    twitch,
    transcript,
    defaultContent,
    theographic,
    interpretations,
  ])
    host.register(ext);
}
