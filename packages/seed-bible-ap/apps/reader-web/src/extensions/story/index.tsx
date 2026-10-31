// THE STORY — what a tap on a section heading ("The Creation") or on the chapter's title opens: the Story pane at the
// right, titled by the heading or the book, on what has been published about it first (StoryPane.tsx). Read from the
// story layer the scripture agent serves and the publishing app's index, through this reader's agent; nothing else.
import { h } from "preact";
import type { ExtensionRegistration } from "../host";
import { StoryPane, storyFocus, storyTitle, storyTrail } from "./StoryPane";
import { ExplorePane } from "./ExplorePane";
import "./story.css";

const story: ExtensionRegistration = {
  id: "story",
  label: "Story",
  description:
    "Tap a section heading or the chapter's title: what has been published about it, then who, where and what happens — and a person's oikos and generations.",
  init: function* (ctx) {
    yield ctx.panes.register({
      id: "explore",
      title: "Explore",
      render: () => h(ExplorePane, { state: ctx.state }),
    });
    yield ctx.panes.register({
      id: "story",
      title: storyTitle,
      render: () => h(StoryPane, { state: ctx.state }),
    });
    yield ctx.tools.registerHeadingTool({
      id: "story",
      label: "Story",
      icon: "auto_stories",
      onSelect: (c) => {
        storyTrail.value = [];
        storyFocus.value = {
          scope: "section",
          chapterRef: c.chapterRef,
          heading: c.heading,
          start: c.start,
          end: c.end,
          tab: null,
        };
        ctx.panes.open("story");
      },
    });
    yield ctx.tools.registerBookTool({
      id: "story",
      label: "Story",
      onSelect: (c) => {
        storyTrail.value = [];
        storyFocus.value = {
          scope: "book",
          bookId: c.bookId,
          bookName: c.bookName,
          tab: null,
        };
        ctx.panes.open("story");
      },
    });
  },
};

export default story;
