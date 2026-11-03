# ContratoClaro Live Demo Script

**Duration:** 5-7 minutes
**Data:** synthetic demo account and contract only
**Environment:** local Docker Compose; never demonstrate with real contracts

## Before the Demo

1. Ensure Docker Compose is running and all services are healthy:

   ```powershell
   docker compose up --build -d
   docker compose ps
   ```

2. Ensure `.env` contains a unique `DEMO_USER_PASSWORD` of at least 12
   characters and a valid `DEMO_USER_EMAIL`.
3. Seed the development account and contract (safe to repeat):

   ```powershell
   docker compose exec -e SEED_DEMO=true backend node dist/scripts/seed-demo.js
   ```

4. Open `http://localhost:8080`; sign in using the demo credentials from `.env`.

## Demo Flow

1. **Set context:** Explain that the tool provides general information, not legal
   advice, and that the sample contract is synthetic.
2. **Show the result:** Open the seeded demo lease from History. The history
   screen loads persisted contracts from the API; select the lease to view its
   overall risk score, color-and-label risk categories, and clause explanations.
3. **Inspect a risk:** Expand the automatic-renewal high-risk clause. Explain
   that the text is a synthetic example and that legal references are shown
   only when supplied by the configured legal context.
4. **Prepare the objection:** Generate the letter. Show that it includes only
   medium/high-risk clauses, edit the recipient placeholder, save the change,
   and copy the text to the clipboard.
5. **Demonstrate language and theme:** In the header, switch the interface to
   English (note dates, scores, and percentages reformat via `Intl`) and back
   to Spanish; use the header or Settings switch to change light/dark and
   reload the page to prove there is no theme flash and the choice persists.
6. **Download:** Download the saved letter as PDF and verify the updated wording.
7. **Explain privacy and AI:** State that the demo stores synthetic structured
   results, does not store an original upload, and runs a hybrid pipeline by
   default (local neural model classifies; a hosted provider only refines
   uncertain clauses and writes letters when `ANTHROPIC_API_KEY` or
   `GEMINI_API_KEY` is set — otherwise everything stays on-device). Mention
   the external-AI consent notice shown before upload in that case. Do not
   represent the offline evaluation as model accuracy.
8. **Show resilience (optional):** Restart the backend mid-analysis to show the
   stuck-job recovery marking the contract `FAILED` with a translated message
   instead of polling forever.

## Offline fallback

If the room has no internet, restart the backend with
`AI_PROVIDER=fake docker compose up --build -d backend` (deterministic rule
double, no model downloads) and run the same script. The `/ready` endpoint
reports the active provider so the audience can verify which mode is live.

## Reset and Cleanup

- Log out and stop the services with `docker compose down`.
- Demo data remains in the named PostgreSQL volume. To erase all local demo
  data, first verify the project and volume name with `docker volume ls`, then
  use the explicit volume-removal procedure in the deployment guide. Do not run
  destructive volume commands against a shared or production environment.
