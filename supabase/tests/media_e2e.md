# Chat files end-to-end test (run 2026-11-06 against the live project)

Storage rules (rolled-back transaction, two businesses A and B) — 9/9:
B uploads into B/out ✓ · B can't upload into A's folder ✓ · B can't fake a customer file (in/) ✓ ·
B attaches its upload to a reply ✓ · B can't attach A's file ✓ · a saved file can't be swapped ✓ ·
A can't see B's files ✓ · B sees its own ✓ · bucket is private ✓

Live functions (throwaway "Media Test Shop", fake token; deleted afterwards — 0 files, 0 keys left):

| Step | Expected | Result |
| --- | --- | --- |
| Signed webhook: customer sends a photo with caption | message saved, Meta media id kept, file fetched from Meta | saved "[image] My payment proof", media id 1234567890; Meta refused the fake token, reason kept: `190 Malformed access token` |
| Reply with a file that isn't in storage | stopped with a clear reason, not retried | "The file couldn't be found" (now permanent) |
