// THE STORY — a section heading's tools: tap "The First Day" and the heading toolbar offers Scene, Cast, Setting,
// Communication, Events and Communities, each opening the Story pane on that tab for the verses under the heading.
// Read from the story layer the scripture agent serves (data.ts); nothing is fetched elsewhere.
import { h } from "preact";
import type { ExtensionRegistration } from "../host";
import { StoryPane, storyFocus, storyTrail, type StoryTab } from "./StoryPane";
import "./story.css";

const TOOLS: Array<{ tab: StoryTab; label: string; icon: string }> = [
  { tab: "scene", label: "Scene", icon: "theater_comedy" },
  { tab: "cast", label: "Cast", icon: "groups" },
  { tab: "setting", label: "Setting", icon: "location_on" },
  { tab: "communication", label: "Communication", icon: "forum" },
  { tab: "events", label: "Events", icon: "event" },
  { tab: "communities", label: "Communities", icon: "church" },
];

const story: ExtensionRegistration = {
  id: "story",
  label: "Story",
  description:
    "Tap a section heading to see its scene, cast, setting, who speaks to whom, its events and communities — and drill into a person's oikos and generations.",
  init: function* (ctx) {
    yield ctx.panes.register({
      id: "story",
      title: "Story",
      render: () => h(StoryPane, { state: ctx.state }),
    });
    for (const [i, tool] of TOOLS.entries())
      yield ctx.tools.registerHeadingTool({
        id: `story-${tool.tab}`,
        label: tool.label,
        icon: tool.icon,
        priority: 100 - i,
        onSelect: (c) => {
          storyTrail.value = [];
          storyFocus.value = {
            chapterRef: c.chapterRef,
            heading: c.heading,
            start: c.start,
            end: c.end,
            tab: tool.tab,
          };
          ctx.panes.open("story");
        },
      });
  },
};

export default story;
