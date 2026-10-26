# Assign a playbook to a reader's agent — the first-run step

A person's agent offers the Library _reads_ (`library.file.read`, `library.files.list`) only from a playbook that
carries them; the saves are always offered. Without a playbook a reader's marks can be written but never read back
(ADR-0006 §4). The Home's consent ceremony writes the assignment; for a demo person a script does it with their own
Home session:

```bash
cd packages/seed-bible-ap
node scripts/assign-playbook.mjs seedreader                      # agentic-trust/person-steward (the estate baseline)
node scripts/assign-playbook.mjs <handle> <context> <archetype>  # another compiled archetype
```

The script refuses a definition whose tool ids collide (the harness would reject it and the agent would run bare).
Done for `seedreader` on 2026-10-21 (`person-steward`, 79 tools). Verify with `pnpm smoke:vault`.
