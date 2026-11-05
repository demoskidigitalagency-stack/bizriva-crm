"""The intake Edge Function ships the normaliser part of src/domain/intake.ts
(flatten → autoMap → normalise). Fail if the copy drifts from the app's."""
import pathlib, sys
root = pathlib.Path(__file__).resolve().parent.parent
def core(text: str) -> str:
    return text[text.index("/* ───────────── flatten"):text.index("export function normalise")] + text[text.index("export function normalise"):].split("\n}\n", 1)[0]
app = core((root / "src/domain/intake.ts").read_text())
fn = core((root / "supabase/functions/intake/intake.ts").read_text())
if app != fn:
    print("FAIL: supabase/functions/intake/intake.ts differs from src/domain/intake.ts — copy the normaliser over and redeploy")
    sys.exit(1)
print("1/1 passed")
