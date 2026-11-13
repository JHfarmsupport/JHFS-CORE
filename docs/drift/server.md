# Core på egen server – trin for trin

Ca. 1–1½ time første gang. Du skal bruge: din pc, din iPhone, adgang til Simply (domæne) og et betalingskort.

> Undervejs laver du nogle kodeord. **Skriv dem aldrig i en chat.** Gem dem i din password-manager,
> og skriv backup-kodeordet ned på papir sammen med gendannelseskoderne.

---

## 1. Hetzner-konto
1. Opret en konto på **console.hetzner.com**. Firmaet som kunde, betaling med kort.
2. Slå **to-faktor** til med det samme: Konto → Security.

## 2. SSH-nøgle på din pc (din "nøgle" til serveren)
Åbn **PowerShell** på pc'en og skriv:
```
ssh-keygen -t ed25519 -C "jens-pc"
```
Tryk Enter tre gange. Vis så nøglen:
```
type $env:USERPROFILE\.ssh\id_ed25519.pub
```
Kopiér hele linjen (starter med `ssh-ed25519`). Det er den **offentlige** del – den må gerne deles.
Filen uden `.pub` er den hemmelige – den forlader aldrig din pc.

## 3. Opret serveren
I Hetzner Console → nyt projekt "JHFS Core" → **Add Server**:
- Location: **Falkenstein** eller **Helsinki** (EU)
- Image: **Ubuntu 24.04**
- Type: **CX22** (2 CPU, 4 GB) – ca. 40–50 kr./md.
- SSH key: indsæt linjen fra trin 2
- Navn: `jhfs-core`

Skriv serverens **IPv4-adresse** ned.

## 4. Adresse hos Simply
Hos Simply → DNS for jhfarmsupport.dk → ny **A-post**:
- Navn: `core`
- Værdi: serverens IPv4-adresse

(Har serveren en IPv6-adresse, så lav også en **AAAA-post** med samme navn.)

## 5. Gør serveren sikker (én gang)
Fra PowerShell: `ssh root@<IP>` (svar "yes" første gang).

Åbn `deploy/opsaet-server.sh` på GitHub → **Raw** → kopiér alt. På serveren:
```
nano opsaet-server.sh      # indsæt, gem med Ctrl+O, Enter, Ctrl+X
bash opsaet-server.sh "ssh-ed25519 AAAA...din-linje-fra-trin-2..."
```
Når den er færdig: `exit`, og log ind igen som **`ssh jens@<IP>`**. Root kan ikke længere logge ind.

## 6. Hent Core til serveren
Serveren får sin egen nøgle, som **kun kan læse** repoet:
```
ssh-keygen -t ed25519 -f ~/.ssh/github -N ""
cat ~/.ssh/github.pub
```
På GitHub → JHFS-CORE → Settings → **Deploy keys** → Add deploy key → indsæt → **lad "Allow write access" være slået FRA**.
```
printf 'Host github.com\n  IdentityFile ~/.ssh/github\n' >> ~/.ssh/config
git clone git@github.com:JHfarmsupport/JHFS-CORE.git /opt/jhfs-core
```

## 7. Hemmeligheder og start
```
cd /opt/jhfs-core/deploy
cp env.eksempel .env && chmod 600 .env
openssl rand -hex 32     # kør to gange: én til DB_ADMIN_KODE, én til DB_APP_KODE
nano .env                   # indsæt kodeordene, gem
docker compose up -d --build
```
Efter et par minutter: åbn **https://core.jhfarmsupport.dk** på telefonen – du skal se login-siden med hængelås.

## 8. Opret dig selv
```
docker compose exec app node --import tsx src/admin-cli.ts opret-ejer \
  --firma "JH Farm Support ApS" --email mail@jhfarmsupport.dk --navn "Jens Høj"
```
Åbn linket på din **iPhone** inden 30 minutter → "Opret passkey" → Face ID.
**Print de 10 gendannelseskoder** og læg dem et sikkert sted.

## 9. Backup
1. Hetzner Console → **Storage Box** → BX11 (ca. 25 kr./md.), helst en anden lokation end serveren.
   Slå **SSH support** til. Skriv brugernavnet ned (`uXXXXXX`).
2. På serveren:
   ```
   ssh-keygen -t ed25519 -f ~/.ssh/storagebox -N ""
   ssh-copy-id -p 23 -s -i ~/.ssh/storagebox uXXXXXX@uXXXXXX.your-storagebox.de
   printf 'Host storagebox\n  HostName uXXXXXX.your-storagebox.de\n  User uXXXXXX\n  Port 23\n  IdentityFile ~/.ssh/storagebox\n' >> ~/.ssh/config
   ```
3. Lav et backup-kodeord med `openssl rand -hex 32`, sæt det ind som `RESTIC_PASSWORD` i `.env`.
   **Skriv det ned på papir** – uden det kan backuppen ikke åbnes, heller ikke af Hetzner eller mig.
4. Kør den første backup og testen, og slå de automatiske timere til:
   ```
   ./backup.sh
   ./backup-test.sh            # skal slutte med "Backup OK"
   sudo bash installer-backup.sh
   ```
Fremover: backup hver nat kl. 02:15, test af backuppen hver søndag kl. 05:00.

---

## Opdatering af Core
Når der er nyt i `main` på GitHub:
```
cd /opt/jhfs-core && git pull && cd deploy && docker compose up -d --build
```

## Hvis serveren er væk
1. Ny server (trin 3–7).
2. Hent backuppen tilbage:
   ```
   restic -r sftp:storagebox:jhfs-backup dump --tag db latest jhfs.dump > jhfs.dump
   docker compose up -d db
   docker compose exec -T db pg_restore -U postgres --clean --if-exists -d jhfs < jhfs.dump
   docker compose up -d --build
   ```
3. Log ind som altid med din passkey.

## Hvad er åbent mod internettet?
Kun **port 443/80** (Core via Caddy med HTTPS) og **port 22** (SSH, kun med nøgle).
Databasen og programmet kan ikke nås udefra. Adresser, der gætter på SSH, blokeres i et døgn (fail2ban).
Sikkerhedsopdateringer installeres automatisk hver nat.
