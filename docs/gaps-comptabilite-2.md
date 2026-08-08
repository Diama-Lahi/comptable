# Éléments manquants (partie 2) — approfondissement

Suite du document `gaps-comptabilite.md`. Mêmes conventions : explication,
fonctionnement, champs clés. Tables SQL correspondantes dans
`schema-extensions-2.sql`.

---

## 1. Lettrage des comptes clients/fournisseurs

**Différence avec le rapprochement bancaire** : le rapprochement bancaire
confirme qu'un mouvement bancaire correspond à une écriture comptable. Le
lettrage, lui, confirme qu'une **facture précise** est soldée par un ou
plusieurs paiements précis — deux problèmes différents, souvent confondus.

**Pourquoi c'est nécessaire** : sans lettrage, tu sais que « Client X doit
500 000 FCFA » au total, mais pas laquelle de ses 5 factures est en cause,
ni depuis quand. Impossible de relancer intelligemment ou de justifier le
compte en clôture.

**Fonctionnement** :
- Chaque paiement reçu/émis est rattaché à une ou plusieurs factures (une
  facture peut être payée en plusieurs fois ; un paiement peut solder
  plusieurs factures).
- Une facture est « lettrée » quand la somme des paiements qui lui sont
  rattachés égale son montant TTC. Sinon elle reste « partiellement lettrée »
  ou « non lettrée ».
- Rapport de balance âgée (« aged balance ») automatique : factures non
  lettrées classées par ancienneté (0-30 jours, 30-60, 60-90, +90) — la base
  des relances clients.

**Champs clés** : lien facture ↔ paiement (many-to-many), montant imputé par
lien, statut de lettrage par facture (non lettrée / partielle / soldée).

---

## 2. Facturation client conforme

**Pourquoi** : le plan couvrait la réception des factures d'achat, mais pas
l'émission de tes propres factures de vente — pourtant c'est ce qui rentre de
l'argent.

**Exigences légales (Sénégal/OHADA)** :
- Numérotation séquentielle continue, sans trou, par exercice.
- Mentions obligatoires : NINEA de l'émetteur, adresse, nature de
  l'opération, taux et montant de TVA distincts du HT, conditions de
  paiement, NINEA du client si assujetti.
- Facture normalisée électronique : la DGI a mis en place des obligations de
  facturation électronique normalisée pour certains contribuables — à
  vérifier selon le régime et le chiffre d'affaires de chaque entreprise (le
  cadre évolue, à reconfirmer au moment de l'implémentation).

**Fonctionnement** :
- Génération de facture à partir d'un devis ou directement, avec
  numérotation automatique impossible à modifier une fois la facture émise.
- Modèle PDF avec toutes les mentions obligatoires pré-remplies depuis la
  fiche entreprise.
- Une facture émise et envoyée ne peut plus être supprimée — seulement
  annulée par un avoir (facture d'avoir), pour garder la continuité de la
  numérotation.

---

## 3. Comptes courants associés

**Pourquoi** : très pertinent pour toi en tant qu'entrepreneur indépendant.
Quand tu injectes de l'argent personnel dans École Sénégal ou Teranga Direct
(ou que tu en retires), ce n'est ni une charge, ni un produit, ni du capital
au sens strict — c'est une dette ou une créance entre toi et la société,
suivie sur un compte courant associé (classe 4, compte 455).

**Fonctionnement** :
- Chaque apport ou retrait est enregistré sur le compte courant de
  l'associé concerné (toi, ou un futur associé).
- Solde du compte courant suivi en continu : combien la société te doit (ou
  te doit-elle), séparément du résultat de l'exploitation.
- Utile aussi si une convention prévoit une rémunération (intérêts) sur ce
  compte courant — à calculer périodiquement si applicable.

**Champs clés** : associé, date, type (apport/retrait/intérêt), montant,
solde courant.

---

## 4. Acomptes et avances clients

**Pourquoi** : si un directeur d'école paie un acompte avant le déploiement
d'École Sénégal, le traitement TVA n'est pas le même qu'une facture normale —
le fait générateur de la TVA peut être à l'encaissement de l'acompte
(prestations de services) et non à la facturation finale.

**Fonctionnement** :
- Un acompte reçu est enregistré séparément (compte 4191 « clients, avances
  et acomptes reçus »), pas directement en produit.
- Quand la prestation/vente est réalisée, la facture finale déduit l'acompte
  déjà facturé/payé, et solde le compte d'avance.
- La TVA sur l'acompte est calculée et déclarée dès son encaissement (pour
  les prestations de services), pas seulement à la facture finale — point
  d'attention fiscal à faire valider par un comptable dès la mise en place.

**Champs clés** : client, montant de l'acompte, date d'encaissement, facture
finale liée, TVA sur acompte déjà déclarée (oui/non).

---

## 5. Douane et import (Teranga Direct)

**Pourquoi** : un volet fiscal entier propre à l'activité d'import,
totalement absent du plan initial, qui se concentrait sur une comptabilité
générale classique.

**Ce qu'il faut suivre** :
- Droits de douane à l'importation (taux variable selon la nature du
  produit, ex. Café Touba).
- TVA à l'importation (souvent payée à la douane, récupérable ensuite comme
  TVA déductible si l'entreprise y est assujettie).
- Frais de transit, d'entreposage, de dédouanement — à intégrer au coût
  d'acquisition de la marchandise (et non en simple charge), ce qui affecte
  la marge réelle calculée.

**Fonctionnement** :
- Une déclaration douanière liée à un ou plusieurs achats fournisseurs,
  avec : valeur en douane, droits payés, TVA à l'import payée, frais annexes.
- Le coût total de revient de la marchandise importée additionne : prix
  d'achat + fret + droits de douane + frais de transit — calculé
  automatiquement plutôt qu'estimé.

---

## 6. Engagements hors bilan

**Pourquoi** : mentionné en passant dans le plan initial (dans les annexes
du bilan) mais jamais détaillé — pourtant obligatoire à lister en clôture.

**Ce qui en fait partie** :
- Cautions données (ex. garantie locative) ou reçues.
- Garanties bancaires.
- Engagements de crédit-bail.
- Litiges en cours avec un impact financier potentiel.

**Fonctionnement** : un registre simple, mis à jour manuellement au fil de
l'eau (impossible à déduire automatiquement des écritures), mais rappelé
systématiquement lors de la préparation des annexes de clôture — pour ne pas
l'oublier.

---

## 7. Multi-comptes bancaires / multi-caisses

**Pourquoi** : le schéma actuel suppose une seule banque et une seule caisse
par entreprise. En pratique, tu auras probablement plusieurs comptes — par
exemple un compte FCFA et un compte CAD pour Teranga Direct, ou un compte
séparé par établissement scolaire client d'École Sénégal.

**Fonctionnement** :
- Chaque compte bancaire et chaque caisse physique devient une entité
  identifiée séparément (numéro, devise, solde).
- Les imports bancaires et bons de caisse se rattachent à un compte
  spécifique, pas globalement à l'entreprise.
- Rapprochement bancaire fait compte par compte, avec un solde théorique
  distinct pour chacun.

---

## 8. Seuil d'audit légal (commissaire aux comptes)

**Pourquoi** : dans l'espace OHADA, au-delà de certains seuils (chiffre
d'affaires, total bilan, effectif — les seuils exacts varient et évoluent,
à reconfirmer auprès d'un professionnel au moment où ça devient pertinent),
la nomination d'un commissaire aux comptes devient obligatoire.

**Fonctionnement dans l'app** : pas d'automatisation complexe nécessaire —
un simple indicateur dans le tableau de bord qui compare le chiffre
d'affaires et les effectifs de l'entreprise aux seuils connus, avec une
alerte informative (« vous approchez du seuil qui rend un audit légal
obligatoire — à vérifier avec un professionnel »). Aucune action automatique,
juste un rappel.

---

## 9. Consolidation entre tes différentes activités

**Pourquoi** : si École Sénégal, Teranga Direct et les projets communautaires
partagent une même structure légale, ou si tu veux simplement une vue
d'ensemble de ton « empire » de projets, il manque un reporting consolidé.

**Fonctionnement** :
- Si les activités sont dans des entités légales séparées (`companies`
  différentes) : un tableau de bord consolidé additionne simplement leurs
  résultats, sans écriture comptable de consolidation (pas d'obligation
  légale de consolider en dessous de certains seuils de groupe).
- Si une consolidation légale devient nécessaire (groupe de sociétés
  dépassant les seuils), c'est un chantier comptable à part entière
  (élimination des opérations intra-groupe, etc.) — à ne considérer que si
  la situation se présente réellement.

---

## Priorisation suggérée (partie 2)

| Priorité | Élément | Raison |
|---|---|---|
| Haute | Facturation client conforme | Nécessaire dès la première vente à un client |
| Haute | Lettrage clients/fournisseurs | Indispensable dès qu'il y a plus d'une facture par client |
| Haute | Multi-comptes bancaires/caisses | Réalité dès que tu as plus d'un compte |
| Moyenne | Comptes courants associés | Utile dès ton premier apport/retrait personnel |
| Moyenne | Acomptes et avances clients | Utile dès le premier acompte d'un directeur d'école |
| Basse (à activer plus tard) | Douane et import | Utile seulement quand Teranga Direct sera actif |
| Basse | Engagements hors bilan | Léger, à activer en fin de préparation de clôture |
| Basse | Seuil d'audit légal | Simple indicateur, pas urgent tant que le CA est modeste |
| Basse | Consolidation multi-entités | À activer seulement si les structures se regroupent réellement |
