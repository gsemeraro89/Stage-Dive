# L'agente designer su Claude Code (Fable 5.2)

## Cos'è
Un "sottoagente" di Claude Code dedicato solo al design. Ha le sue istruzioni, il suo modello (Fable 5.2) e il suo territorio. L'agente principale (Opus) fa tutto il resto e gli passa ogni lavoro visivo.

## È già pronto
Il file è in questo pacchetto: `.claude/agents/designer.md`. Se copi tutta la cartella nel tuo progetto, Claude Code lo trova da solo. Contiene:
- il modello: `model: fable`;
- quando usarlo: ogni lavoro visivo o creativo;
- cosa deve leggere prima: `design/DESIGN.md` e le pagine in `design/reference/`;
- le tue richieste: niente look "da AI", niente blocchi arrotondati, miniature in alta qualità, testi sulle foto sempre leggibili, "Latest uploads" e "Most watched" nella pagina artista;
- il suo territorio: `design/`, `src/styles/`, `src/components/ui/` e lo stile delle pagine. Non tocca database, raccolta da YouTube, player, deploy.

## Se preferisci crearlo a mano
1. In Claude Code scrivi `/agents`.
2. Scegli "Create new agent", poi "Project" (così vale solo per questo progetto).
3. Nome: `designer`. Modello: Fable.
4. Come istruzioni incolla il contenuto di `.claude/agents/designer.md` (tutto quello che c'è sotto le righe iniziali tra `---`).

## Controllo del modello
Apri `/agents`, seleziona `designer` e verifica che il modello sia Fable 5.2. Se `fable` non viene accettato, scrivi nel file `model: claude-fable-5-2`. Se nemmeno questo funziona, nelle sessioni di design cambia modello a mano con `/model`.

## Come usarlo
- **In automatico:** `CLAUDE.md` dice all'agente principale di delegare al designer ogni lavoro visivo.
- **A richiesta:** scrivi per esempio "Usa l'agente designer per disegnare la pagina dei festival".
- **Per idee creative:** "Chiedi al designer due proposte per l'hero della home" (propone prima, costruisce dopo il tuo ok).

## Come tenere il design separato
- Il designer lavora su rami `design/...`, l'agente principale su rami `feat/...`.
- Ogni ramo diventa una richiesta di modifica separata: approvi il design da solo.
- Se cambi idea su una regola di design, falla scrivere in `design/DESIGN.md`: è il documento che comanda.
