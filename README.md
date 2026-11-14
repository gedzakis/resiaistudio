# REŠI — Kompletna AI obrazovna platforma

**Slogan:** *„Tvoj AI profesor je uvek uz tebe.“*

REŠI je moderna, potpuno funkcionalna AI obrazovna aplikacija za učenike osnovnih i srednjih škola, studente fakulteta i sve koji žele da uče brže i razumeju gradivo korak po korak — **potpuno bez registracije i prijavljivanja**.

---

## Glavne mogućnosti

- **Fotografisanje i rešavanje zadataka (`/api/solve`)**: Direktno fotografisanje kamerom na telefonu ili drag-and-drop na računaru, automatska optimizacija slike pre slanja, podrška za PDF/DOCX/TXT, KaTeX prikaz matematičkih i hemijskih formula, provera tačnosti (`mathjs` + AI provera), interaktivni grafikoni funkcija, geometrijski crteži, dijagrami sila u fizici i hemijske reakcije.
- **Tri besplatna pitanja dnevno (Server-Side)**: Atomsko ograničenje od 3 uspešna AI odgovora dnevno po uređaju sa resetovanjem u ponoć po vremenskoj zoni `Europe/Belgrade`. Neuspešni zahtevi, greške i nečitljive fotografije se automatski vraćaju korisniku i ne troše limit.
- **AI Profesor (`/api/professor`)**: Interaktivni razgovor sa 4 nivoa objašnjenja (*Početni*, *Srednji*, *Napredni*, *Fakultetski*) i mogućnošću prenosa konteksta direktno iz rešenog zadatka.
- **AI Code Lab & Debugger (`/api/code/debug`)**: Editor sa sintaksnim bojenjem za 13 jezika (*Python, JavaScript, TypeScript, Java, C, C++, C#, PHP, HTML, CSS, SQL, Go, Rust*), prepoznavanje koda sa fotografije, pronalaženje sintaksnih i logičkih grešaka, optimizacija koda i **izolovani sandbox** za bezbedno pokretanje JavaScript-a u pregledaču.
- **Testovi i simulacije ispita (`/api/quiz/generate`)**: Generisanje testova po predmetu, oblasti i težini, sa režimom simulacije kontrolnog/ispita uz tajmer i automatskim ocenjivanjem (1–5 i 6–10).
- **Alati za učenje**:
  - **PDF, skripte i lekcije (`/api/documents/analyze`)**: Sažeci, definicije, ključne činjenice i pitanja za ponavljanje iz PDF, `.docx`, `.pptx`, `.txt` fajlova ili fotografija knjiga.
  - **AI Generator prezentacija (`/api/presentations/generate`)**: Generisanje slajdova sa realnim izvozom u **PowerPoint (`.pptx`)** i **PDF**.
  - **AI Kartice za učenje (`/api/flashcards/generate`)**: Interaktivne kartice za pamćenje sa praćenjem naučenog gradiva u `localStorage`.
- **Srpski jezik (Latinica i Ћирилица)** i **Svetla / Tamna tema**.

---

## Struktura projekta

```text
├── api/
│   └── index.ts              # Vercel serverless ulazna tačka za /api/*
├── server/
│   ├── app.ts                # Express API rute i zaštita kvote
│   ├── documents.ts          # Bezbedna obrada PDF, DOCX, PPTX i slika
│   ├── gemini.ts             # Centralizovani @google/genai servis
│   └── quota.ts              # Atomska dnevna kvota (Europe/Belgrade)
├── server.ts                 # Node.js + Vite server (port 3000)
├── src/
│   ├── components/           # UI moduli (Solver, CodeLab, Professor, Quiz, Tools, Visualizer)
│   ├── i18n/serbian.ts       # Latinica <-> Ћирилица i katalog predmeta
│   ├── types/resi.ts         # Deljeni TypeScript tipovi
│   ├── utils/                # Detekcija uređaja, kompresija slika, localStorage, PPTX/PDF izvoz
│   ├── App.tsx
│   └── main.tsx
├── vercel.json               # Konfiguracija za Vercel deployment
└── .env.example              # Šablon serverskih promenljivih
```

---

## Podešavanje okruženja

1. Kopiraj `.env.example` u `.env` za lokalni razvoj:
   ```bash
   cp .env.example .env
   ```
2. Popuni serverske promenljive:
   - `GEMINI_API_KEY` — Tvoj Gemini API ključ (nikada se ne šalje na frontend).
   - `GEMINI_MODEL` — Opciono (podrazumevano `gemini-3.5-flash-lite`; može se promeniti na drugi dostupan Gemini model po potrebi).
   - `QUOTA_HMAC_SECRET` — Nasumični tajni niz za potpisivanje first-party `HttpOnly` kolačića uređaja.
   - `UPSTASH_REDIS_REST_URL` i `UPSTASH_REDIS_REST_TOKEN` (ili `KV_REST_API_URL` / `KV_REST_API_TOKEN`) — **Obavezno za Vercel** kako bi atomsko brojanje 3 besplatna pitanja dnevno bilo trajno između serverless instanci.

---

## Lokalno pokretanje

```bash
npm install
npm run dev
```

Aplikacija će biti dostupna na `http://localhost:3000`.

---

## Uputstvo za Vercel Deployment

1. Poveži GitHub repozitorijum na [Vercel](https://vercel.com).
2. U Vercel projektu dodaj **Upstash Redis** (ili **Vercel KV**) integraciju kako bi promenljive `UPSTASH_REDIS_REST_URL` i `UPSTASH_REDIS_REST_TOKEN` bile automatski postavljene.
3. U **Project Settings → Environment Variables** dodaj:
   - `GEMINI_API_KEY`
   - `GEMINI_MODEL` (opciono, podrazumevano `gemini-3.5-flash-lite`)
   - `QUOTA_HMAC_SECRET`
4. Vercel će automatski prepoznati `vercel.json`:
   - Build komanda: `npm run build`
   - Output direktorijum: `dist`
   - Sve `/api/*` rute izvršavaće se bezbedno na serverskoj strani kroz `api/index.ts`.
