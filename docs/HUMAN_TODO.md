# Orbit — Human TODO

Tasks that require manual action outside the codebase.

---

## Email Delivery — Pending Verification

All DNS records and SMTP config are set. SPF and DMARC records were added to Porkbun on 2026-04-15 — allow up to 24h for propagation.

Verify propagation:
```bash
python3 -c "import urllib.request,json; r=urllib.request.urlopen('https://dns.google/resolve?name=owenstuckman.lol&type=TXT'); print([a['data'] for a in json.loads(r.read()).get('Answer',[])])"
python3 -c "import urllib.request,json; r=urllib.request.urlopen('https://dns.google/resolve?name=_dmarc.owenstuckman.lol&type=TXT'); print([a['data'] for a in json.loads(r.read()).get('Answer',[])])"
```

- [ ] **Email flow** — Register a new account at `/auth/register`, confirm the signup email arrives, click the link, land at `/auth/complete-registration`

---

## Mobile App — Remaining Setup

### iOS Native Project (requires macOS + Xcode)
Run on a Mac:
```bash
cd /path/to/Orbit
npx cap add ios
npx cap open ios
```
Then in Xcode:
- **Signing & Capabilities** → add "Push Notifications" capability
- **Signing & Capabilities** → add "Associated Domains" → `applinks:owenstuckman.lol`
- Merge `docs/ios-plist-additions.xml` into `ios/App/App/Info.plist`
- Run `npx @capacitor/assets generate --ios` to generate icons/splash

### Firebase Cloud Messaging (push notifications)
1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Add an Android app with package name `com.orbit.app` → download `google-services.json` → place at `android/app/google-services.json`
3. Add an iOS app with bundle ID `com.orbit.app` → download `GoogleService-Info.plist` → place in `ios/App/App/`
4. Get the **Server Key** from Project Settings → Cloud Messaging:
   ```bash
   supabase secrets set FCM_SERVER_KEY=<your-server-key>
   npx supabase functions deploy send-push
   ```

---

## Completed

- [x] Resend account created, `owenstuckman.lol` domain verified
- [x] `RESEND_API_KEY` and `EMAIL_FROM` secrets set in Supabase
- [x] Supabase Auth custom SMTP configured (`smtp.resend.com:465`)
- [x] All 4 auth email templates Orbit-branded (confirm, recovery, invite, email-change)
- [x] DKIM record set (`resend._domainkey.owenstuckman.lol`)
- [x] SPF record added to Porkbun (2026-04-15) — `v=spf1 include:_spf.resend.com ~all`
- [x] DMARC record added to Porkbun (2026-04-15) — `v=DMARC1; p=none; rua=mailto:dmarc@owenstuckman.lol`
- [x] ML API live at `https://orbitqcml.onrender.com`, `ML_API_KEY` confirmed and set
- [x] QC ML scoring verified end-to-end (2026-04-16) — real confidence breakdowns confirmed in `/qc`
- [x] Supabase Auth redirect URLs configured — `com.orbit.app://login-callback` and `https://orbit-sandy.vercel.app/**`
- [x] Android assets generated — 87 assets via `npx @capacitor/assets generate --android`
