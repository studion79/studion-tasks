# Lot 5 - QA Multi-device + Checklist visuelle

## Cibles
- iPhone 16 - Safari iOS (PWA installée)
- Android récent - Chrome

## Exécution automatisée (Playwright)
### 1) QA mobile de base (sans compte)
```bash
npx playwright test tests/e2e/multi-device-qa.spec.ts --project=iphone16-safari-pwa --project=android-chrome --grep "public mobile baseline"
```

### 2) QA mobile authentifiée (home + vues projet)
```bash
E2E_USER_EMAIL="votre_email" \
E2E_USER_PASSWORD="votre_mot_de_passe" \
npx playwright test tests/e2e/multi-device-qa.spec.ts --project=iphone16-safari-pwa --project=android-chrome --grep "authenticated mobile flow"
```

### 3) Rapport visuel
```bash
npx playwright show-report
```

## Checklist visuelle manuelle (réelle, appareil en main)
## A. Home / Dashboard
- [ ] Le chargement initial est lisible en moins de 2 secondes.
- [ ] Aucun élément ne sort de l'écran (pas de scroll horizontal de page).
- [ ] Les filtres de `Mes tâches` restent dans le cadre, y compris `Terminées`.
- [ ] Le mini calendrier est lisible et clique correctement.
- [ ] Le planning du jour affiche bien les tâches avec heure et sans créneau.
- [ ] La bottom nav mobile ne masque aucun CTA important.

## B. Vues projet mobile
- [ ] `Tableur`: hiérarchie catégorie/sous-catégorie compréhensible.
- [ ] `Fiches`: cartes lisibles, pas de débordement de badges/champs.
- [ ] `Kanban`: colonnes utilisables au swipe, aucune coupure de contenu.
- [ ] `Calendrier`: vue mois et vue journée sont utilisables sans overlap.
- [ ] Popups/panneaux ne sortent pas de l'écran.
- [ ] Aucune interaction ne demande un zoom navigateur.

## C. Agenda / Calendrier (Lot 4)
- [ ] Retour visuel visible lors du tap sur un jour.
- [ ] En vue journée, ligne "heure actuelle" visible.
- [ ] Auto-scroll vers l'heure courante quand on ouvre "aujourd'hui".
- [ ] Les tâches en période et en échéance apparaissent correctement.

## D. Micro-interactions
- [ ] Les cartes interactives ont un feedback tactile (tap/press).
- [ ] Les transitions restent fluides (pas de jank visible).
- [ ] Les états `hover/focus/active` restent cohérents clair/sombre.

## E. Validation finale
- [ ] Test iPhone 16 Safari PWA: OK
- [ ] Test Android Chrome: OK
- [ ] Aucune régression desktop détectée

## Artefacts attendus
- Captures Playwright générées:
  - `mobile-login-baseline.png`
  - `home-initial.png`
  - `home-filter-completed.png`
  - `project-initial.png`
  - `project-spreadsheet.png`
  - `project-cards.png`
  - `project-kanban.png`
  - `project-calendar.png`
