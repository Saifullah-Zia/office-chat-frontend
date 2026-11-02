# Deploying Office Chat on Railway

Three Railway services in one project: **Postgres**, **backend** (Spring Boot), **frontend** (Next.js).
Sized for 20–40 people; expect roughly $15–25/month (check Railway's pricing page).

> **Patient data (HIPAA):** Railway doesn't sign a Business Associate Agreement on its standard plans
> (confirm with Railway). If patient information (PHI) will be shared in chat, files or calls,
> settle this with your compliance owner before going live.

---

## 0. Before you start

- Both repos pushed to GitHub (`office-chat-backend`, `office-chat-frontend`).
- **Stop committing uploaded files.** `uploads/` is now in the backend's `.gitignore`, but 14 files were
  already committed. Remove them from the repo (they stay on your disk):
  ```bash
  cd office-chat-backend
  git rm -r --cached uploads
  git commit -m "Stop tracking user uploads"
  git push
  ```
  They remain in Git history; if they contain anything sensitive, ask for a history clean-up.
- **New secrets for production** (the development ones are in Git history):
  - JWT secret, 64+ random characters:
    `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
  - Agora: in the Agora console, create a new **App Certificate** (or a new project) for production.

---

## 1. Create the project and database

1. railway.com → **New Project** → **Deploy PostgreSQL**.
2. Open the Postgres service → **Backups** → turn on scheduled backups.

## 2. Backend service

1. In the project: **+ Create** → **GitHub Repo** → `office-chat-backend`.
   It builds with the repo's `Dockerfile` (`railway.json` tells Railway to).
2. **Volume** (keeps uploads, profile photos and push keys across deploys):
   backend service → **Settings → Volumes → Add volume**, mount path **`/data`**.
3. **Variables** (backend service → Variables → Raw editor):
   ```
   PGHOST=${{Postgres.PGHOST}}
   PGPORT=${{Postgres.PGPORT}}
   PGUSER=${{Postgres.PGUSER}}
   PGPASSWORD=${{Postgres.PGPASSWORD}}
   PGDATABASE=${{Postgres.PGDATABASE}}

   JWT_SECRET=<the 64-character secret from step 0>
   AGORA_APP_ID=<production Agora App ID>
   AGORA_APP_CERTIFICATE=<production Agora App Certificate>

   UPLOAD_DIR=/data/uploads
   VAPID_KEY_FILE=/data/vapid-keys.properties
   PUSH_SUBJECT=mailto:it@yourcompany.com

   # Filled in after step 3 (the frontend's address):
   CORS_ALLOWED_ORIGINS=https://<frontend-domain>
   ```
   Optional: `ANTHROPIC_API_KEY=...` turns on message translation and chat summaries.
4. **Settings → Networking → Generate Domain** (or add your own, e.g. `api.yourcompany.com`).
5. **Keep it at 1 replica** (the default). "Who's in a call", rate limits and online status are kept in
   the server's memory, so a second copy would split them. One copy handles 40 people easily.
6. Deploy. The health check is `/api/health`. If `JWT_SECRET` is missing, the backend refuses to start
   on purpose (see the deploy logs).

## 3. Frontend service

1. **+ Create** → **GitHub Repo** → `office-chat-frontend`.
2. **Variables:**
   ```
   NEXT_PUBLIC_API_URL=https://<backend-domain>
   NEXT_PUBLIC_AGORA_APP_ID=<production Agora App ID>
   ```
   The WebSocket address is worked out from `NEXT_PUBLIC_API_URL` automatically.
   `NEXT_PUBLIC_*` values are built into the app: **redeploy the frontend after changing them.**
3. **Settings → Networking → Generate Domain** (or your own, e.g. `chat.yourcompany.com`).
4. Go back to the **backend** variables, set `CORS_ALLOWED_ORIGINS=https://<frontend-domain>`
   (exact address, no trailing slash; several allowed, comma-separated), and redeploy the backend.

## 4. First sign-in

- Fresh database: open the frontend → **Register**. The **first account becomes the admin**;
  after that only admins can create accounts (Admin Panel → Add employee / Import CSV).
- Or move your existing local data instead (next section).

## 5. Moving your local data (optional)

```bash
# 1) Export the local database
pg_dump -h localhost -U postgres -d office_chat --no-owner --no-acl -F c -f office_chat.dump

# 2) Import into Railway (Postgres service → Connect → copy the public connection URL)
pg_restore --no-owner --no-acl -d "<railway public DATABASE_URL>" office_chat.dump
```
Uploaded files: copy your local `uploads/` folder into the volume's `/data/uploads`
(Railway CLI: `railway ssh` into the backend service, or upload with `railway volume` tools).
Without them, old attachments and photos show as missing; new ones work.

## 6. Custom domains

Add them under each service's **Networking**. Then update `NEXT_PUBLIC_API_URL` (frontend, redeploy)
and `CORS_ALLOWED_ORIGINS` (backend, redeploy). HTTPS is automatic; it's required for camera,
microphone and push notifications.

---

## Checklist after deploying

- [ ] Log in, send a message, and see it arrive live in a second browser.
- [ ] Upload a file and a profile photo; **redeploy the backend**; both are still there (volume works).
- [ ] Voice and video call between two computers; share a screen.
- [ ] Settings → Notifications → "Notify me when the app is closed"; close the app; get a message.
- [ ] Postgres backups are on.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| App loads, but login fails with a network/CORS error | `CORS_ALLOWED_ORIGINS` doesn't exactly match the frontend address, or the backend wasn't redeployed |
| Frontend still calls `localhost:8080` | `NEXT_PUBLIC_API_URL` set after the build; redeploy the frontend |
| Backend crashes on start: "Set JWT_SECRET" | Add `JWT_SECRET` (64+ chars) |
| Files or photos disappear after a deploy | No volume at `/data`, or `UPLOAD_DIR` isn't `/data/uploads` |
| Push notifications stop after a deploy | `VAPID_KEY_FILE` isn't on the volume, so new keys were generated |
| Calls fail to connect | Agora App ID/Certificate mismatch between backend and frontend, or the certificate wasn't set |
| Live updates stop | The backend restarted; the app reconnects by itself within ~5 seconds |
