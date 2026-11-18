# Prima di iniziare con Claude Code — checklist

## 1. Cosa trovi in questa cartella
| File | A cosa serve |
|---|---|
| `CLAUDE.md` | Le regole del progetto. Claude Code lo legge da solo ogni volta che apri la cartella: stack, regole YouTube, modo di lavorare. |
| `docs/BRIEF.md` | La specifica del prodotto: pagine, player, raccolta dei set, monetizzazione, le 6 fasi di sviluppo e le decisioni ancora aperte. |
| `data/seed-sets.json` | I 23 set già controllati (i tuoi 10 + i 14 di NTO) e il profilo di NTO. Sono i dati di partenza. |
| `design/DESIGN.md` | Il design approvato (direzione "Magazine"): colori, tipografia, regole, componenti, pagine. |
| `design/reference/` | Le tre pagine approvate (home, artista, set). Aprile nel browser. |
| `design/tokens.css` | Colori e font pronti da usare nel codice. |
| `.claude/agents/designer.md` | L'agente designer, che usa Fable 5.2. Vedi `AGENTE-DESIGN.md`. |
| `reference/prototype.html` | Il vecchio prototipo: serve solo per capire il funzionamento, non per il look. |
| `PRIMO-PROMPT.md` | Il primo messaggio da incollare in Claude Code. |

## 2. Account e chiavi da preparare (prima di iniziare)
**Servono subito (fase 1):**
- [ ] **GitHub**: un account e un repository privato vuoto, per esempio `opendecks`. Claude Code ci salva il codice.
- [ ] **Render**: il tuo account c'è già. Per il database Postgres e i job automatici servono i piani a pagamento (pochi dollari al mese); il piano gratuito va bene per provare.
- [ ] **Claude Code installato** sul tuo computer, oppure Claude Code sul web collegato a GitHub.

**Servono dalla fase 3 (raccolta automatica dei set):**
- [ ] **Chiave YouTube Data API v3**: su console.cloud.google.com crei un progetto, attivi "YouTube Data API v3" e generi una chiave API. È gratuita, con un limite giornaliero di quota.
- [ ] **Chiave API Anthropic** (console.anthropic.com): serve al collector per riconoscere artista, location e genere di ogni video. Costo stimato: pochi centesimi per set.

**Servono più avanti (fasi 5–6):**
- [ ] **Dominio**: GoDaddy è già collegato.
- [ ] **Strumento di analytics**: Plausible oppure GA4.
- [ ] **Newsletter**: per esempio Brevo, Beehiiv o Mailchimp.
- [ ] **Google AdSense**: solo quando ogni pagina dei set avrà contenuti originali.

## 3. Decisioni che Claude Code ti chiederà (meglio averle pronte)
1. **Upload dei fan**: li includiamo o solo canali ufficiali?
2. **Nome e dominio** definitivi (OpenDecks è provvisorio).
3. **Soglia di visualizzazioni** per il lancio (proposta: 200k).
4. **Lista dei canali** di partenza: Cercle, Boiler Room, HÖR, Mixmag, DJ Mag, festival… aggiungi i tuoi preferiti.
5. **Newsletter e analytics**: quali strumenti usare.

## 4. Quale modello usare
- **Claude Opus** per pianificare ogni fase e per le parti difficili: il player che continua a suonare tra una pagina e l'altra e il collector di YouTube.
- **Claude Sonnet** va bene per le modifiche di routine (testi, stile, piccoli fix), costa meno ed è più veloce.
- Usa la **modalità piano** (Shift+Tab in Claude Code) all'inizio di ogni fase: Claude propone il piano, tu approvi, poi scrive il codice.

## 5. Come procedere
1. Crea una cartella sul tuo computer e copia dentro tutto il contenuto di questo pacchetto.
2. Apri Claude Code in quella cartella.
3. Incolla il messaggio di `PRIMO-PROMPT.md`.
4. Approva il piano della fase 1 e vai avanti una fase alla volta. Ogni fase finisce con qualcosa che puoi vedere online.
