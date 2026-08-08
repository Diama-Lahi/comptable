# Principe directeur : automatisation maximale, revue humaine sur exceptions seulement

Ce document remplace la logique "validation à chaque étape" par un principe
unique qui traverse tous les modules déjà définis. Il ne remplace pas les
documents précédents (cahier des charges, plan détaillé, gaps 1-2-3) — il
change la façon dont ils s'articulent entre eux.

---

## Le principe

Presque tous les modules du projet (factures, banque, paie, immobilisations,
acomptes, douane, notes de frais...) ne sont pas 26 processus séparés
nécessitant chacun leur validation. Ce sont **des sources différentes qui
alimentent un seul flux central** : au bout du compte, tout devient une
écriture dans `entries` / `entry_lines`.

Ancien modèle (implicite dans les documents précédents) :
```
Facture reçue → OCR → suggestion → VALIDATION HUMAINE → écriture
Banque importée → matching → suggestion → VALIDATION HUMAINE → rapprochement
Paie calculée → VALIDATION HUMAINE → écriture
... (répété pour chaque module)
```

Nouveau modèle :
```
Facture reçue → OCR → imputation → écriture générée → passée automatiquement
Banque importée → matching → rapprochement → passé automatiquement
Paie calculée → écriture générée → passée automatiquement
...
                                          ↓
                    UNE SEULE FILE D'EXCEPTIONS
                    (tout ce qui a un score de confiance bas,
                     ou qui sort d'une règle connue)
                                          ↓
                    Revue humaine groupée, en fin de mois
                    (ou en continu, mais un seul écran)
```

---

## Le moteur de confiance

Chaque source d'écriture calcule un **score de confiance** au moment de la
génération automatique. Le score détermine si l'écriture part directement en
comptabilité, ou atterrit dans la file d'exceptions.

| Source | Facteurs de confiance | Passe automatiquement si... |
|---|---|---|
| Facture (OCR + imputation) | Qualité de lecture OCR, fournisseur déjà connu, règle d'imputation existante et fiable (utilisée >N fois sans correction) | OCR net + fournisseur connu + règle stable |
| Rapprochement bancaire | Montant exact, date proche, libellé similaire | Correspondance "certaine" (déjà prévu dans `reconciliations.confidence`) |
| Paie | Salaire de base inchangé, pas d'absence/prime exceptionnelle | Toujours (calcul déterministe une fois les paramètres saisis) |
| Amortissements | Toujours déterministe (formule fixe) | Toujours |
| Bon de caisse | Montant sous le plafond défini | Sous plafond |
| Acomptes clients | Montant conforme au contrat/devis existant | Contrat identifié |
| Douane/import | Cohérence valeur déclarée vs facture d'origine | Écart faible |
| Régularisations de clôture | — | **Jamais automatique** : toujours proposées, jamais passées seules (voir plus bas) |

Un score bas ne bloque rien : l'écriture peut quand même être **provisoirement**
enregistrée (statut `draft` dans `entries`), mais elle apparaît dans la file
d'exceptions tant qu'elle n'est pas confirmée.

---

## La file d'exceptions unique

Un seul écran, alimenté par toutes les sources, plutôt qu'un écran de
validation par module :

- Factures à confiance basse (nouveau fournisseur, OCR incertain)
- Rapprochements bancaires "à vérifier"
- Écarts de caisse (théorique ≠ comptage physique)
- Anomalies de pré-clôture (soldes anormaux, comptes d'attente)
- Régularisations de fin d'exercice suggérées (charges à payer, provisions...)
- Relances clients qui nécessitent un geste commercial (pas juste l'envoi
  automatique d'un email standard)

Vue SQL correspondante dans `schema-extensions-4.sql` : `monthly_review_queue`.
Elle rassemble en une seule liste tout ce qui attend un regard humain, peu
importe le module d'origine.

**Objectif concret** : en fin de mois, au lieu de valider 400 écritures une
par une, le comptable (toi, ou un futur cabinet) ne voit que les 5 à 15
lignes qui sortent vraiment de l'ordinaire.

---

## Ce qui reste un acte humain distinct — et seulement ça

Après ce recentrage, la liste des points de contrôle réellement obligatoires
(légalement, pas par prudence excessive) se réduit à deux choses :

1. **La signature et le dépôt de la liasse fiscale / des déclarations à la
   DGI.** L'application prépare tout ; l'acte de dépôt reste humain.
2. **Les décisions fiscales non standards** (interprétation d'un texte,
   montage particulier, régularisation inhabituelle).

Tout le reste — y compris la "justification des comptes" en clôture — peut
être largement pré-rempli par la détection d'anomalies. S'il n'y a rien
d'anormal détecté, la clôture peut être confirmée en un clic plutôt que
réexpliquée compte par compte.

---

## Ce que ça change dans le calendrier de développement

Ce principe ne rajoute pas de nouveau module — il change **comment** les
modules déjà prévus (Phases 1 à 5 du plan détaillé) doivent être construits
dès le départ :

- Chaque module qui génère une écriture doit calculer un score de confiance
  dès sa première version, même simple (ex. : "fournisseur déjà vu 3 fois
  avec la même imputation" = haute confiance).
- L'écran de "file d'exceptions" doit exister tôt (même basique), plutôt que
  d'être ajouté à la fin — sinon chaque module recrée son propre écran de
  validation par habitude, et on retombe dans l'ancien modèle.
- Le seuil de confiance (à partir de quand une ligne passe automatiquement)
  doit être ajustable — au départ, plutôt strict (plus de choses dans la
  file d'exceptions, le temps de faire confiance au système), puis relâché
  progressivement une fois l'historique constitué.
