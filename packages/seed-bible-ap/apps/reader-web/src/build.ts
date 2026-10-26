// THE BUILD ID — the same constant in the page the Worker renders and in the client bundle, so the client can
// tell whether the markup it was handed came from its own build (hydrate.tsx). `scripts/build-id.mjs` writes
// the git short hash here before a build; "dev" is what a checkout and the tests see.
export const BUILD_ID = "dev";
