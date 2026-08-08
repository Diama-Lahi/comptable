# Éléments manquants – à intégrer au plan comptable

Ce document détaille les 9 zones non couvertes par le plan initial. Pour chacune :
ce que c'est, pourquoi c'est nécessaire, comment ça fonctionne dans l'app, et les
champs/tables à prévoir. Le fichier `schema-extensions.sql` contient les tables
SQL correspondantes, prêtes à ajouter au schéma principal.

---

## 1. Immobilisations et amortissements

**Pourquoi** : obligatoire en clôture SYSCOHADA (classe 2 + classe 68). Sans ce
module, chaque véhicule, ordinateur ou bâtiment acheté reste une simple charge
non suivie, et le bilan est faux.

**Fonctionnement** :
- Chaque immobilisation est enregistrée avec : date d'acquisition, valeur
  d'origine, durée d'amortissement (ex. 3 ans pour du matériel informatique,
  5 ans pour du mobilier, 20 ans pour un bâtiment), méthode (linéaire – la plus
  courante en PME).
- L'application calcule automatiquement, chaque mois ou chaque année, la
  dotation aux amortissements (valeur d'origine ÷ durée) et génère l'écriture
  comptable correspondante (débit 681 « Dotations aux amortissements », crédit
  281 « Amortissements »).
- Un registre des immobilisations donne à tout moment : valeur d'origine,
  cumul des amortissements, valeur nette comptable (VNC).
- Gestion de la sortie d'immobilisation (vente, mise au rebut) avec calcul de
  la plus ou moins-value.

**Champs clés** : libellé, catégorie, date d'acquisition, valeur d'origine,
durée (mois), méthode, compte d'immobilisation, compte d'amortissement,
date de sortie (si applicable), valeur de cession (si applicable).

---

## 2. Paie et personnel

**Pourquoi** : dès le premier employé, il faut gérer les bulletins de paie et
les déclarations sociales – un domaine entier absent du plan initial.

**Fonctionnement** :
- Fiche employé : poste, salaire de base, date d'embauche, régime (IPRES,
  IPM, CSS).
- Génération mensuelle des bulletins de paie : salaire brut, cotisations
  salariales (IPRES retraite, IPM maladie), cotisations patronales (CSS,
  IPRES part patronale), retenue à la source sur salaire (impôt), salaire net.
- Écriture comptable automatique par bulletin (charges de personnel 661,
  charges sociales 664, dettes envers le personnel 421, dettes sociales 431).
- Déclaration sociale mensuelle (IPRES/CSS) et état récapitulatif annuel des
  salaires, préparés automatiquement – dépôt reste manuel/humain comme pour
  les autres déclarations fiscales.

**Champs clés** : employé, période, salaire brut, cotisations (liste),
retenues, net à payer, statut de la déclaration sociale du mois.

---

## 3. Stocks – valorisation, pas seulement les achats

**Pourquoi** : le plan actuel enregistre les achats de marchandises, mais ne
valorise pas le stock en fin de mois. Sans valorisation, le résultat
(coût des marchandises vendues) est faux.

**Décision à prendre** : ton projet de gestion de stock est déjà séparé
(stock/supplier management system). Deux options :
- **Intégrer** : la compta lit directement les mouvements de stock depuis ce
  système via une passerelle (API/webhook), pour calculer le coût des ventes.
- **Dupliquer un minimum** : la compta garde une valorisation simplifiée
  (quantité + coût moyen pondéré) juste pour les écritures de clôture, sans
  gérer le stock opérationnel (ça reste dans l'autre système).

**Fonctionnement (si intégré)** :
- Méthode de valorisation : coût moyen pondéré (le plus simple à automatiser)
  ou FIFO.
- À chaque vente, calcul automatique du coût des marchandises vendues (CMV)
  et écriture correspondante (compte 603 variation de stock).
- Stock final = stock initial + achats – CMV, comparé à l'inventaire physique
  en fin de période, écart mis en évidence.

---

## 4. Devises (FCFA / CAD et autres)

**Pourquoi** : pertinent pour Teranga Direct (flux Sénégal – Canada). Une
simple étiquette « devise » sur chaque facture ne suffit pas : il faut
convertir et suivre les écarts de change.

**Fonctionnement** :
- Table des taux de change par date (source : taux officiel ou taux du jour
  saisi manuellement).
- Chaque facture/écriture en devise étrangère est enregistrée dans sa devise
  d'origine ET convertie en FCFA (devise de référence comptable) au taux du
  jour de l'opération.
- À l'encaissement/paiement, si le taux a changé, écart de change calculé
  automatiquement (compte 676 pertes de change / 776 gains de change).

**Champs clés** : devise, taux du jour, montant devise d'origine, montant
converti, écart de change à l'échéance.

---

## 5. Régularisations de fin d'exercice

**Pourquoi** : sans ça, la clôture ne reflète pas la réalité économique de la
période (charges/produits qui ne correspondent pas exactement à l'encaissement/
décaissement).

**Trois régularisations principales** :
- **Charges à payer** : une dépense de la période, mais dont la facture
  arrivera après la clôture (ex. électricité de décembre, facturée en
  janvier) – à provisionner.
- **Produits constatés d'avance** : un encaissement reçu qui couvre une
  période future (ex. abonnement annuel encaissé en janvier pour toute
  l'année) – à étaler.
- **Provisions pour créances douteuses** : un client qui ne paie pas depuis
  longtemps – l'application peut détecter automatiquement les factures
  clients en retard de plus de X jours et suggérer une provision.

**Fonctionnement** : l'application détecte les cas probables (factures reçues
après la date de clôture mais concernant la période, factures clients très en
retard) et propose l'écriture de régularisation – validée par le comptable.

---

## 6. Régime fiscal par entité

**Pourquoi** : le plan actuel suppose le régime réel normal (TVA classique,
18 %). Si une de tes structures est en régime simplifié ou en Contribution
Globale Unique (CGU), les obligations changent complètement (pas de TVA à
déclarer par exemple, impôt forfaitaire).

**Fonctionnement** :
- Chaque entreprise (`companies`) a un champ `régime fiscal` : réel normal,
  réel simplifié, ou CGU.
- Le calendrier fiscal (section 4.6 du plan détaillé) et les déclarations
  générées s'adaptent automatiquement au régime choisi – pas de déclaration
  TVA proposée pour une entreprise en CGU par exemple.

---

## 7. Comptabilité analytique par projet

**Pourquoi** : tu gères plusieurs activités (École Sénégal, Teranga Direct,
projets communautaires). Si certaines partagent une même entité légale, le
découpage actuel par `company_id` ne suffit pas pour savoir ce que chaque
projet gagne ou coûte individuellement.

**Fonctionnement** :
- Une dimension analytique optionnelle (« centre de coût » ou « projet ») sur
  chaque ligne d'écriture, en plus du compte comptable.
- Rapports filtrables par projet : résultat par projet, à côté du résultat
  global de l'entreprise.

**Champs clés** : code projet, libellé, sur chaque ligne d'écriture (`entry_lines`).

---

## 8. Notes de frais et avances

**Pourquoi** : absent du plan actuel – tes propres dépenses professionnelles
(déplacement, matériel, avance à un tiers) n'ont pas de circuit dédié.

**Fonctionnement** :
- Saisie d'une note de frais : date, motif, montant, justificatif (photo),
  personne concernée.
- Statut : soumise – approuvée – remboursée.
- Suivi des avances données (à un employé, un fournisseur) avec solde restant
  à récupérer ou à justifier.

---

## 9. Conservation légale des pièces

**Pourquoi** : l'espace OHADA impose une conservation des documents
comptables pendant 10 ans. Sans politique d'archivage, rien ne garantit que
les factures et pièces scannées resteront accessibles et intactes aussi
longtemps.

**Fonctionnement** :
- Chaque pièce (facture, bon de caisse, bulletin de paie) est stockée avec
  horodatage et jamais supprimée, seulement archivée après clôture définitive
  de l'exercice.
- Politique de sauvegarde régulière du stockage de fichiers (Supabase
  Storage) vers une deuxième copie (ex. Google Drive, déjà connecté).
- Export périodique d'une archive complète par exercice clos (toutes les
  pièces + les livres comptables) pour garantir l'accès même si l'application
  change dans le futur.

---

## Priorisation suggérée

| Priorité | Élément | Raison |
|---|---|---|
| Haute | Régularisations de fin d'exercice | Bloque une clôture correcte dès le premier mois |
| Haute | Régime fiscal par entité | Nécessaire pour distinguer tes différentes structures |
| Moyenne | Immobilisations et amortissements | Nécessaire dès le premier achat d'équipement |
| Moyenne | Notes de frais et avances | Usage personnel immédiat |
| Moyenne | Comptabilité analytique par projet | Utile dès que plusieurs projets partagent une entité |
| Basse (à décider) | Stocks (valorisation) | Dépend de la décision d'intégration avec le système de stock existant |
| Basse | Devises | Utile seulement quand Teranga Direct sera actif |
| Basse | Paie et personnel | Utile seulement si embauche |
| Continue | Conservation légale | Politique à définir tôt, mais peu de développement immédiat |
