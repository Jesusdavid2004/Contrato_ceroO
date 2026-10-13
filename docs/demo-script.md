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
   docker compose exec backend node dist/scripts/seed-demo.js
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
   medium/high-risk clauses, edit one sentence, and save the change.
5. **Demonstrate language and theme:** Switch the interface to English and back
   to Spanish; change the theme and confirm the preference remains visible.
6. **Download:** Download the saved letter as PDF and verify the updated wording.
7. **Explain privacy:** State that the demo stores synthetic structured results,
   does not store an original upload, and uses `FakeAIProvider` when no
   Anthropic API key is set. Do not represent the offline evaluation as model
   accuracy.

## Reset and Cleanup

- Log out and stop the services with `docker compose down`.
- Demo data remains in the named PostgreSQL volume. To erase all local demo
  data, first verify the project and volume name with `docker volume ls`, then
  use the explicit volume-removal procedure in the deployment guide. Do not run
  destructive volume commands against a shared or production environment.
