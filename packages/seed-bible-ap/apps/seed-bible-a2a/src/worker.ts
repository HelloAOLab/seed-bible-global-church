// The Worker entry: the app, the run object, and the cron that re-crawls the shelves.
import app, { reindex, SvcRunDO, type Env } from "./index";
export { SvcRunDO };
export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      reindex(env).then((r) =>
        console.log(
          `[registry] cron reindex: ${JSON.stringify(r).slice(0, 600)}`
        )
      )
    );
  },
};
