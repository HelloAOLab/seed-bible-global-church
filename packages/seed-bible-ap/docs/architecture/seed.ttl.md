# `seed:` T-box (draft)

Canonical prefix: `seed:` `https://skills.demo/seed#` (repo convention). Promote verbatim to `~/skills/ontology/seed.ttl`, add `seed` to `preflight.py DOMAINS` and `sync_ontology.py CONTEXTS`, then `preflight.py` until green. See [ontology.md](./ontology.md).

```turtle
# ═══════════════════════════════════════════════════════════════════════════════════════════════
# Seed — DOMAIN ONTOLOGY for reading Scripture together (T-box + SHACL)
#
# A reader's marks on the text, where they are, what they are reading through, and what a church
# or ministry publishes around a chapter. The TEXT is never minted here: loci, editions and wording
# are scripture's (scr:Verse, scr:Passage, scr:ScriptureEdition, scr:VerseText); the church that
# owns a customization is faith's (gc:AgentiveEkklesia) acting through an at:ChurchAgent.
# Repo SOURCE for GraphDB <urn:skills:context:seed>.
#
# ── Grounding ──────────────────────────────────────────────────────────────────────────────────
# Highlight, Annotation, Bookmark, Save, ReadingPosition, ReaderSettings, Profile, PlanProgress,
#   CustomizationSelection, ExtensionBinding, SecretRef, McpServerBinding, GalleryImage ⊑ at:KnowledgeRecord
# ReadingEvent, PlaylistPlay ⊑ at:Activity
# Playlist, ReadingPlan, Offering, Customization ⊑ pub:ContentWork
# ReadingSession ⊑ at:Situation ; ShareGrant ⊑ at:Delegation
# HighlightColor, OfferingKind, SessionRole, Visibility ⊑ at:Category
# aboutPassage → scr:Passage ; ofEdition → scr:ScriptureEdition ; heldBy → at:Person ;
# publishedBy → at:Organization | at:Person
#
# ── Invariants ─────────────────────────────────────────────────────────────────────────────────
# 1. A MARK IS THE PERSON'S. Every at:KnowledgeRecord here is seed:heldBy exactly one at:Person;
#    never the workspace, never the service.
# 2. THE TEXT IS NOT HERE. No seed: class carries verse wording.
# 3. A LISTING IS NOT A GRANT. A seed:ShareGrant is evidence of a delegation; who may read is
#    decided at the gate, never by the town's listing.
# 4. A SECRET IS A POINTER. seed:SecretRef carries no value.
# 5. VISIBILITY IS EXPLICIT. Private unless seed:visibility says otherwise.
#
# ── Dependency direction ───────────────────────────────────────────────────────────────────────
# seed → scripture → { publishing, commerce, faith(gc:) } → agentic-trust → { prov, dul, p-plan }
# seed may reach UP into any of these; none of them may reference seed:.
# ═══════════════════════════════════════════════════════════════════════════════════════════════

@prefix seed:    <https://skills.demo/seed#> .
@prefix scr:     <https://skills.demo/scripture#> .
@prefix pub:     <https://skills.demo/publishing#> .
@prefix gc:      <https://ontology.global.church/core#> .
@prefix fci:     <https://ontology.faithchain.org/incubator#> .
@prefix at:      <https://agentictrustlabs.dev/ns/agentic-trust#> .
@prefix skills:  <https://agentictrustlabs.dev/ns/skills#> .
@prefix owl:     <http://www.w3.org/2002/07/owl#> .
@prefix rdf:     <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs:    <http://www.w3.org/2000/01/rdf-schema#> .
@prefix sh:      <http://www.w3.org/ns/shacl#> .
@prefix xsd:     <http://www.w3.org/2001/XMLSchema#> .
@prefix skos:    <http://www.w3.org/2004/02/skos/core#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix prov:    <http://www.w3.org/ns/prov#> .
@prefix oa:      <http://www.w3.org/ns/oa#> .
@prefix schema:  <https://schema.org/> .

<https://skills.demo/seed> a owl:Ontology ;
    rdfs:label "Seed — reading Scripture together" ;
    owl:versionInfo "0.1.0" ;
    owl:imports <https://agentictrustlabs.dev/ns/agentic-trust> ;
    owl:imports <https://skills.demo/scripture> ;
    owl:imports <https://skills.demo/publishing> ;
    owl:imports <https://ontology.global.church/core/v0.51.14> ;
    dcterms:description "The seed bounded context: a reader's highlights, notes, bookmarks, saves, position, settings and history on scripture passages; reading plans, playlists and chapter offerings a person or organization publishes; an organization's branded customization and a reader's selection of it; live reading sessions; and the share grants that let another agent read a private slice." ;
    skos:scopeNote "THE PERSON OWNS THE MARK; THE TOWN LISTS, IT DOES NOT GRANT. Scripture loci and wording come from the scripture context; church bodies from faith; authority from agentic-trust." .

# ── Controlled lists (values in seed.data.ttl as seed:<class>-<notation>) ───────────────────────
seed:HighlightColor a owl:Class ; rdfs:subClassOf at:Category ; rdfs:label "Highlight colour" .
seed:OfferingKind   a owl:Class ; rdfs:subClassOf at:Category ; rdfs:label "Offering kind" .
seed:SessionRole    a owl:Class ; rdfs:subClassOf at:Category ; rdfs:label "Session role" .
seed:Visibility     a owl:Class ; rdfs:subClassOf at:Category ; rdfs:label "Visibility" ;
    rdfs:comment "world | friends | private. Private unless stated." .

# ── Private records (at:KnowledgeRecord) ────────────────────────────────────────────────────────
seed:Highlight a owl:Class ; rdfs:subClassOf at:KnowledgeRecord ; rdfs:seeAlso oa:Annotation ;
    rdfs:label "Highlight" ; rdfs:comment "A coloured mark on a passage. seed:heldBy exactly one at:Person." .
seed:Annotation a owl:Class ; rdfs:subClassOf at:KnowledgeRecord ; rdfs:seeAlso oa:Annotation ;
    rdfs:label "Annotation" ; rdfs:comment "A note (rich text) on a passage; may reply to another annotation." .
seed:Bookmark a owl:Class ; rdfs:subClassOf at:KnowledgeRecord ; rdfs:label "Bookmark" ;
    rdfs:comment "A named, movable place in an edition." .
seed:Save a owl:Class ; rdfs:subClassOf at:KnowledgeRecord ; rdfs:label "Save" .
seed:SaveCategory a owl:Class ; rdfs:subClassOf at:KnowledgeRecord ; rdfs:label "Save category" .
seed:ReadingPosition a owl:Class ; rdfs:subClassOf at:KnowledgeRecord ; rdfs:label "Reading position" ;
    rdfs:comment "Where the person is now. One per person." .
seed:ReaderSettings a owl:Class ; rdfs:subClassOf at:KnowledgeRecord ; rdfs:label "Reader settings" ;
    rdfs:comment "Theme, fonts, toolbar, language, tutorial and onboarding flags." .
seed:Profile a owl:Class ; rdfs:subClassOf at:KnowledgeRecord ; rdfs:label "Reader profile" .
seed:PlanProgress a owl:Class ; rdfs:subClassOf at:KnowledgeRecord ; rdfs:label "Plan progress" .
seed:SessionProgress a owl:Class ; rdfs:subClassOf at:KnowledgeRecord ; rdfs:label "Plan session progress" .
seed:CustomizationSelection a owl:Class ; rdfs:subClassOf at:KnowledgeRecord ; rdfs:label "Customization selection" ;
    rdfs:comment "Which org customization and variant this person uses. Not membership." .
seed:ExtensionBinding a owl:Class ; rdfs:subClassOf at:KnowledgeRecord ; rdfs:label "Extension binding" .
seed:SecretRef a owl:Class ; rdfs:subClassOf at:KnowledgeRecord ; rdfs:label "Secret reference" ;
    rdfs:comment "Pointer to a vault-held secret. The value is never a graph term." .
seed:ProxyEndpoint a owl:Class ; rdfs:subClassOf at:KnowledgeRecord ; rdfs:label "Proxy endpoint" ;
    rdfs:comment "Host, visibility (private or public-run) and request mapping for a SecretRef." .
seed:McpServerBinding a owl:Class ; rdfs:subClassOf at:KnowledgeRecord ; rdfs:label "MCP server binding" .
seed:GalleryImage a owl:Class ; rdfs:subClassOf at:KnowledgeRecord ; rdfs:seeAlso schema:ImageObject ; rdfs:label "Gallery image" .

# ── Activities ─────────────────────────────────────────────────────────────────────────────────
seed:ReadingEvent a owl:Class ; rdfs:subClassOf at:Activity ; rdfs:label "Reading event" ;
    rdfs:comment "One history event for timeline and heatmap. Identity is (agent, passage, startedAt)." .
seed:PlaylistPlay a owl:Class ; rdfs:subClassOf at:Activity ; rdfs:label "Playlist play" .

# ── Works (pub:ContentWork) ────────────────────────────────────────────────────────────────────
seed:Playlist a owl:Class ; rdfs:subClassOf pub:ContentWork ; rdfs:seeAlso schema:CreativeWork ; rdfs:label "Playlist" ;
    rdfs:comment "Ordered passages and media. Private until released to the public shelf." .
seed:PlaylistItem a owl:Class ; rdfs:subClassOf at:KnowledgeRecord ; rdfs:label "Playlist item" .
seed:ScriptureItem a owl:Class ; rdfs:subClassOf seed:PlaylistItem .
seed:HtmlItem      a owl:Class ; rdfs:subClassOf seed:PlaylistItem .
seed:LinkItem      a owl:Class ; rdfs:subClassOf seed:PlaylistItem .
seed:ReadingPlan a owl:Class ; rdfs:subClassOf pub:ContentWork ; rdfs:label "Reading plan" .
seed:PlanSession a owl:Class ; rdfs:subClassOf at:KnowledgeRecord ; rdfs:label "Plan session" .
seed:PlanReading a owl:Class ; rdfs:subClassOf at:KnowledgeRecord ; rdfs:label "Plan reading" .
seed:CadenceOption a owl:Class ; rdfs:subClassOf at:KnowledgeRecord ; rdfs:label "Cadence option" .
seed:Customization a owl:Class ; rdfs:subClassOf pub:ContentWork ; rdfs:label "Customization" ;
    rdfs:comment "An organization's branded reader. seed:publishedBy an at:Organization (.org or .church)." .
seed:ThemeVariant a owl:Class ; rdfs:subClassOf at:KnowledgeRecord ; rdfs:label "Theme variant" .
seed:ExtensionSettingDefault a owl:Class ; rdfs:subClassOf at:KnowledgeRecord ; rdfs:label "Extension setting default" .
seed:Offering a owl:Class ; rdfs:subClassOf pub:ContentWork ; rdfs:label "Offering" ;
    rdfs:comment "Chapter-scoped content an org or person offers (video, article, episode, study)." .

# ── Situations and delegations ─────────────────────────────────────────────────────────────────
seed:ReadingSession a owl:Class ; rdfs:subClassOf at:Situation ; rdfs:label "Reading session" ;
    rdfs:comment "A live shared reading. Presence and the session document are serving-plane. Who may join is a grant or circle membership." .
seed:SessionOptions a owl:Class ; rdfs:subClassOf at:KnowledgeRecord ; rdfs:label "Session options" .
seed:ShareGrant a owl:Class ; rdfs:subClassOf at:Delegation ; rdfs:label "Share grant" ;
    rdfs:comment "Evidence that another agent may read a private slice. Never a gate input; never a town listing." .

# ── Object properties ──────────────────────────────────────────────────────────────────────────
seed:aboutPassage a owl:ObjectProperty ; rdfs:range scr:Passage ; rdfs:label "about passage" ;
    rdfs:comment "The scripture place this mark, event, or offering is about." .
seed:aboutVerse a owl:ObjectProperty ; rdfs:range scr:Verse ; rdfs:subPropertyOf seed:aboutPassage .
seed:ofEdition a owl:ObjectProperty ; rdfs:range scr:ScriptureEdition ; rdfs:label "of edition" .
seed:heldBy a owl:ObjectProperty ; rdfs:subPropertyOf prov:wasAttributedTo ; rdfs:range at:Person ;
    rdfs:comment "The person whose Library holds this. Never the workspace or the service." .
seed:publishedBy a owl:ObjectProperty ; rdfs:subPropertyOf prov:wasAttributedTo ; rdfs:range at:Agent ;
    rdfs:comment "Who released this work. Usually an at:Organization. Listing is not a grant." .
seed:visibility a owl:ObjectProperty ; rdfs:range seed:Visibility .
seed:highlightColor a owl:ObjectProperty ; rdfs:domain seed:Highlight ; rdfs:range seed:HighlightColor .
seed:selectedCustomization a owl:ObjectProperty ; rdfs:domain seed:CustomizationSelection ; rdfs:range seed:Customization .
seed:selectedVariant a owl:ObjectProperty ; rdfs:domain seed:CustomizationSelection ; rdfs:range seed:ThemeVariant .
seed:offeredForPassage a owl:ObjectProperty ; rdfs:domain seed:Offering ; rdfs:range scr:Passage ;
    rdfs:comment "What the Seed registry indexes for Discover." .
seed:offeringKind a owl:ObjectProperty ; rdfs:domain seed:Offering ; rdfs:range seed:OfferingKind .
seed:sessionOf a owl:ObjectProperty ; rdfs:domain seed:ReadingSession ; rdfs:range scr:Passage .
seed:host a owl:ObjectProperty ; rdfs:domain seed:ReadingSession ; rdfs:range at:Agent .
seed:participant a owl:ObjectProperty ; rdfs:domain seed:ReadingSession ; rdfs:range at:Agent .
seed:grantedTo a owl:ObjectProperty ; rdfs:domain seed:ShareGrant ; rdfs:range at:Agent .
seed:progressOf a owl:ObjectProperty ; rdfs:domain seed:PlanProgress ; rdfs:range seed:ReadingPlan .
seed:replyTo a owl:ObjectProperty ; rdfs:domain seed:Annotation ; rdfs:range seed:Annotation .
seed:providesSecret a owl:ObjectProperty ; rdfs:domain seed:Customization ; rdfs:range seed:SecretRef .

# ── Datatype properties ────────────────────────────────────────────────────────────────────────
seed:startedAt a owl:DatatypeProperty ; rdfs:range xsd:dateTime .
seed:endedAt a owl:DatatypeProperty ; rdfs:range xsd:dateTime .
seed:bookmarkName a owl:DatatypeProperty ; rdfs:domain seed:Bookmark ; rdfs:range xsd:string .
seed:note a owl:DatatypeProperty ; rdfs:range xsd:string .
seed:tag a owl:DatatypeProperty ; rdfs:domain seed:Annotation ; rdfs:range xsd:string .
seed:order a owl:DatatypeProperty ; rdfs:range xsd:integer .

# ── Shapes (one per produced class; ≥1 required field beyond rdfs:label) ───────────────────────
seed:HighlightShape a sh:NodeShape ; sh:targetClass seed:Highlight ;
    sh:property [ sh:path seed:heldBy ; sh:class at:Person ; sh:minCount 1 ; sh:maxCount 1 ] ,
                [ sh:path seed:aboutPassage ; sh:class scr:Passage ; sh:minCount 1 ] ,
                [ sh:path seed:highlightColor ; sh:class seed:HighlightColor ; sh:minCount 1 ] .
seed:AnnotationShape a sh:NodeShape ; sh:targetClass seed:Annotation ;
    sh:property [ sh:path seed:heldBy ; sh:class at:Person ; sh:minCount 1 ; sh:maxCount 1 ] ,
                [ sh:path seed:aboutPassage ; sh:class scr:Passage ; sh:minCount 1 ] ,
                [ sh:path seed:note ; sh:datatype xsd:string ; sh:minCount 1 ] .
seed:ReadingEventShape a sh:NodeShape ; sh:targetClass seed:ReadingEvent ;
    sh:property [ sh:path prov:wasAssociatedWith ; sh:class at:Person ; sh:minCount 1 ] ,
                [ sh:path seed:aboutPassage ; sh:class scr:Passage ; sh:minCount 1 ] ,
                [ sh:path seed:startedAt ; sh:datatype xsd:dateTime ; sh:minCount 1 ] .
seed:CustomizationShape a sh:NodeShape ; sh:targetClass seed:Customization ;
    sh:property [ sh:path seed:publishedBy ; sh:class at:Organization ; sh:minCount 1 ] .
seed:OfferingShape a sh:NodeShape ; sh:targetClass seed:Offering ;
    sh:property [ sh:path seed:publishedBy ; sh:minCount 1 ] ,
                [ sh:path seed:offeredForPassage ; sh:class scr:Passage ; sh:minCount 1 ] .
seed:ShareGrantShape a sh:NodeShape ; sh:targetClass seed:ShareGrant ;
    sh:property [ sh:path seed:grantedTo ; sh:class at:Agent ; sh:minCount 1 ] .
```

## Before promotion

- Shapes for every remaining produced class (Bookmark, Save, ReadingPosition, ReaderSettings, Profile, PlanProgress, CustomizationSelection, ExtensionBinding, SecretRef, GalleryImage, Playlist, ReadingPlan, ReadingSession).
- `seed.clusters.ttl`: clusters such as `marks`, `reading`, `library-works`, `customization`, `sessions`, `secrets`; every class in exactly one.
- `seed.data.ttl`: C-box values (`seed:highlightcolor-yellow a seed:HighlightColor, skos:Concept ; skos:inScheme seed:HighlightColor ; skos:notation "yellow"`), A-box examples that satisfy the shapes, and the agentic layer (`urn:skills:cap:seed:seed-highlight-put`, `ex:skill-highlight-put a at:Skill ; at:realizes …; cil:producesClass seed:Highlight ; cil:consumesClass scr:Passage`, archetypes `urn:skills:archetype:seed:seed-reader` etc.).
- Confirm the existing `at:` delegatee property before keeping `seed:grantedTo`.
- Decide whether Highlight/Annotation subclass `oa:Annotation` (only if `ontology/upper/web-annotation.ttl` declares it).
