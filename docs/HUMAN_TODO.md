# Orbit — Human TODO

Tasks that require manual action. No code changes needed.

---

## DNS Records (Porkbun)

Log into [porkbun.com](https://porkbun.com) → **Domain Management** → `owenstuckman.lol` → **DNS Records**

- [ ] **Add SPF record**
  ```
  Type:  TXT
  Host:  (leave blank)
  Value: v=spf1 include:_spf.resend.com ~all
  TTL:   600
  ```

- [ ] **Add DMARC record**
  ```
  Type:  TXT
  Host:  _dmarc
  Value: v=DMARC1; p=none; rua=mailto:dmarc@owenstuckman.lol
  TTL:   600
  ```

> DKIM is already set (`resend._domainkey.owenstuckman.lol`). SPF + DMARC prevent emails landing in spam.

Verify after adding (allow up to 24h to propagate):
```bash
python3 -c "import urllib.request,json; r=urllib.request.urlopen('https://dns.google/resolve?name=owenstuckman.lol&type=TXT'); print([a['data'] for a in json.loads(r.read()).get('Answer',[])])"
python3 -c "import urllib.request,json; r=urllib.request.urlopen('https://dns.google/resolve?name=_dmarc.owenstuckman.lol&type=TXT'); print([a['data'] for a in json.loads(r.read()).get('Answer',[])])"
```

---

## End-to-End Verification

- [ ] **Email flow** — Register a new account at `/auth/register`, confirm the signup email arrives, click the link, land at `/auth/complete-registration`
- [ ] **ML scoring in app** — Log in as employee, accept and submit a task, log in as QC reviewer, open `/qc`, confirm the confidence breakdown shows real values (not flat 80%)

---

## Completed

- [x] Resend account created, `owenstuckman.lol` domain verified
- [x] `RESEND_API_KEY` and `EMAIL_FROM` secrets set in Supabase
- [x] Supabase Auth custom SMTP configured (`smtp.resend.com:465`)
- [x] All 4 auth email templates Orbit-branded (confirm, recovery, invite, email-change)
- [x] DKIM record set (`resend._domainkey.owenstuckman.lol`)
- [x] ML API live at `https://orbitqcml.onrender.com`, `ML_API_KEY` confirmed and set
