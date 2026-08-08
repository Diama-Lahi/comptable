# Éléments manquants (partie 3) — approfondissement

Suite de `gaps-comptabilite.md` et `gaps-comptabilite-2.md`. Tables SQL
correspondantes dans `schema-extensions-3.sql`.

---

## 1. Sécurité des données et conformité (loi n°2008-12 / CDP)

**Pourquoi** : le Sénégal encadre la protection des données personnelles via
la loi n°2008-12, sous supervision de la Commission de protection des
données personnelles (CDP). Les données stockées (noms de clients/
fournisseurs, contacts, NINEA, bulletins de paie) sont concernées — pas
qu'une bonne pratique technique, une obligation légale.

**Fonctionnement** :
- Contrôle d'accès par rôle affiné : distinguer « qui peut valider un
  paiement » (déjà prévu) de « qui peut voir des données personnelles »
  (contacts clients, salaires) — deux permissions différentes.
- Chiffrement des données sensibles au repos (Supabase le fait déjà en
  partie nativement, à vérifier/configurer explicitement pour les champs les
  plus sensibles comme les salaires).
- Registre des traitements de données personnelles (obligation formelle de
  la CDP) : lister quelles données sont collectées, pourquoi, combien de
  temps elles sont conservées — pertinent surtout dès que l'app est vendue à
  d'autres entreprises (chacune devient responsable de traitement pour ses
  propres données).
- Si l'app est vendue à des entreprises tierces, prévoir une déclaration ou
  un enregistrement auprès de la CDP peut être nécessaire selon la nature des
  traitements — à faire confirmer par un juriste local avant la
  commercialisation, ce n'est pas qu'un sujet technique.

---

## 2. Sauvegarde et continuité d'activité

**Différence avec l'archivage légal (déjà prévu)** : l'archivage (10 ans,
OHADA) concerne la conservation légale des pièces. La sauvegarde, ici,
concerne la protection technique contre une panne, une erreur de
manipulation ou une corruption de données — un sujet totalement différent.

**Fonctionnement** :
- Sauvegardes automatiques régulières de la base (Supabase propose des
  sauvegardes automatiques selon le plan choisi — à vérifier et configurer
  explicitement, ne pas supposer que c'est activé par défaut).
- Plan de restauration testé : savoir concrètement comment revenir à un état
  antérieur en cas de problème, pas juste avoir des fichiers de sauvegarde
  jamais testés.
- Journal des sauvegardes : date, statut, taille, pour vérifier que ça
  fonctionne réellement dans la durée.

---

## 3. Relances clients automatisées

**Différence avec le lettrage (déjà prévu)** : le lettrage donne la liste
des factures impayées et leur ancienneté. La relance est le **processus**
qui agit sur cette liste — un module distinct.

**Fonctionnement** :
- Règles de relance configurables : email automatique à J+7 (rappel
  courtois), J+15 (relance ferme), J+30 (mise en demeure) — le ton escalade
  progressivement.
- Historique des relances envoyées par facture, pour ne pas relancer deux
  fois le même jour ou perdre le fil.
- Un tableau de suivi des relances en cours, distinct du tableau de bord
  général de trésorerie.

---

## 4. Rentabilité par produit/service

**Différence avec l'analytique par projet (déjà prévue)** : le centre de
coût/projet donne la rentabilité d'un projet global (ex. École Sénégal dans
son ensemble). Ici, il s'agit d'un niveau plus fin : quelle école cliente
précise, ou quel produit précis (Café Touba vs autre produit Teranga Direct)
est réellement rentable.

**Fonctionnement** :
- Chaque ligne de facture (déjà présente dans `invoice_lines`) est rattachée
  à un produit/service identifié.
- Rapport de marge par produit : chiffre d'affaires généré, coût direct
  associé (achat, transport pour un produit importé), marge résultante.
- Utile pour des décisions concrètes : arrêter un produit peu rentable,
  ajuster un tarif d'abonnement école par école.

---

## 5. Prévisionnel de trésorerie

**Différence avec le tableau de bord déjà prévu** : le tableau de bord
existant est rétrospectif (ce qui s'est passé). Le prévisionnel regarde en
avant : factures clients à échéance + paiements fournisseurs prévus +
charges récurrentes connues (loyer, abonnements) = position de trésorerie
projetée sur les prochaines semaines/mois.

**Fonctionnement** :
- Projection automatique à partir des données déjà existantes : factures
  clients non échues (encaissement prévu), factures fournisseurs approuvées
  non payées (décaissement prévu), charges récurrentes identifiées.
- Alerte si la trésorerie projetée devient négative à une date donnée —
  permet d'anticiper plutôt que de subir un manque de liquidités.

---

## 6. Spécificités Wave / Orange Money

**Pourquoi séparé du rapprochement bancaire classique** : ces plateformes
ont leurs propres frais de transaction (souvent un pourcentage ou un montant
fixe par opération), leurs propres formats de relevé (souvent un export CSV
propriétaire, différent d'un relevé bancaire classique), et un délai de
règlement vers le compte bancaire (l'argent reçu sur Wave n'arrive pas
instantanément sur le compte bancaire lié).

**Fonctionnement** :
- Chaque compte Wave/Orange Money est un `cash_bank_account` de type
  spécifique, avec ses propres frais associés à chaque transaction.
- Import du relevé propre à chaque plateforme (format à adapter selon
  l'export réellement disponible — à vérifier concrètement une fois les
  comptes ouverts, les formats évoluent).
- Suivi du délai de règlement : distinguer « reçu sur Wave » de « arrivé sur
  le compte bancaire », pour ne pas se tromper sur la trésorerie
  réellement disponible.

---

## 7. Accès du cabinet comptable externe

**Pourquoi** : les rôles déjà prévus (comptable, dirigeant, contrôleur) sont
tous des rôles internes à l'entreprise. Un cabinet comptable externe qui
vient consulter les livres en fin de mois a besoin d'un accès différent :
lecture seule (ou lecture + commentaire), limité dans le temps, sans droit
de modification.

**Fonctionnement** :
- Rôle « cabinet externe » : accès en lecture aux livres comptables, aux
  factures, au paquet de clôture — jamais de droit d'écriture directe.
- Le cabinet peut laisser des commentaires ou signaler des points à corriger
  (déjà esquissé dans « historique des échanges avec le cabinet »), sans
  pouvoir modifier une écriture lui-même.
- Accès révocable facilement en fin de mission.

---

## 8. Contrats et facturation récurrente

**Pourquoi** : si École Sénégal facture un abonnement mensuel par école
cliente, il ne faut pas ressaisir une facture identique chaque mois — un
moteur de facturation récurrente s'en charge.

**Fonctionnement** :
- Un contrat définit : client, montant, fréquence (mensuelle, annuelle),
  date de début, date de fin (ou durée indéterminée).
- L'application génère automatiquement la facture à la date prévue, avec la
  numérotation légale déjà en place (section facturation conforme,
  partie 2).
- Gestion des changements en cours de contrat : augmentation de tarif,
  suspension temporaire, résiliation — sans casser l'historique déjà généré.

---

## Priorisation suggérée (partie 3)

| Priorité | Élément | Raison |
|---|---|---|
| Haute | Sauvegarde et continuité d'activité | Risque de perte de données dès le premier mois d'usage réel |
| Haute | Contrats et facturation récurrente | Directement utile pour École Sénégal dès le premier client payant |
| Moyenne | Relances clients automatisées | Utile dès qu'il y a plusieurs clients à suivre |
| Moyenne | Spécificités Wave/Orange Money | Nécessaire dès que ces moyens de paiement sont réellement utilisés |
| Moyenne | Sécurité des données et conformité | À cadrer tôt, surtout avant de vendre à d'autres entreprises |
| Basse | Accès du cabinet comptable externe | Utile seulement si un cabinet externe est effectivement impliqué |
| Basse | Rentabilité par produit/service | Utile une fois plusieurs écoles/produits actifs simultanément |
| Basse | Prévisionnel de trésorerie | Confort une fois les bases (facturation, paiements) en place |
