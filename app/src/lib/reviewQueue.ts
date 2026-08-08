import { supabase, COMPANY_ID } from "@/lib/supabase";

export type ReviewSourceType =
  | "facture"
  | "rapprochement_bancaire"
  | "regularisation_cloture"
  | "bon_de_caisse"
  | "declaration_douane"
  | "paie";

export type ReviewQueueItem = {
  source_type: ReviewSourceType;
  source_id: string;
  company_id: string;
  reason: string;
  created_at: string;
};

export type ReviewResolution = "confirme_tel_quel" | "corrige" | "rejete";

// Sources dont l'écran de la file peut clore directement le drapeau
// "à revoir" (mise à jour en une action). La régularisation de clôture a
// déjà son propre écran de validation/rejet (/regularisations) et n'est
// donc pas résolue ici — on y renvoie seulement.
const DIRECT_RESOLUTION: Partial<
  Record<ReviewSourceType, { table: string; patch: Record<string, unknown> }>
> = {
  facture: { table: "invoices", patch: { needs_review: false } },
  bon_de_caisse: { table: "cash_vouchers", patch: { needs_review: false } },
  declaration_douane: { table: "customs_declarations", patch: { needs_review: false } },
  paie: { table: "payslips", patch: { needs_review: false } },
  rapprochement_bancaire: { table: "reconciliations", patch: { confidence: "certain" } },
};

export const REVIEW_SOURCE_LABELS: Record<ReviewSourceType, string> = {
  facture: "Facture",
  rapprochement_bancaire: "Rapprochement bancaire",
  regularisation_cloture: "Régularisation de clôture",
  bon_de_caisse: "Bon de caisse",
  declaration_douane: "Déclaration douanière",
  paie: "Bulletin de paie",
};

// Où aller pour traiter le point en détail (le module d'origine reste la
// source de vérité ; cet écran ne fait qu'agréger et permettre de clore
// rapidement les cas simples).
export const REVIEW_SOURCE_LINKS: Record<ReviewSourceType, string> = {
  facture: "/factures",
  rapprochement_bancaire: "/banque",
  regularisation_cloture: "/regularisations",
  bon_de_caisse: "/comptes",
  declaration_douane: "/douane",
  paie: "/paie",
};

export async function fetchReviewQueue(): Promise<ReviewQueueItem[]> {
  const { data, error } = await supabase
    .from("monthly_review_queue")
    .select("*")
    .eq("company_id", COMPANY_ID)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export function canResolveInline(sourceType: ReviewSourceType): boolean {
  return sourceType in DIRECT_RESOLUTION;
}

export async function resolveReviewItem(
  item: Pick<ReviewQueueItem, "source_type" | "source_id">,
  resolution: ReviewResolution,
  resolvedBy?: string
): Promise<void> {
  const direct = DIRECT_RESOLUTION[item.source_type];
  if (!direct) {
    throw new Error(
      `Le type "${item.source_type}" se traite depuis ${REVIEW_SOURCE_LINKS[item.source_type]}, pas ici.`
    );
  }

  const { error: updateError } = await supabase
    .from(direct.table)
    .update(direct.patch)
    .eq("id", item.source_id);
  if (updateError) throw updateError;

  const { error: logError } = await supabase.from("review_resolutions").insert({
    source_type: item.source_type,
    source_id: item.source_id,
    resolution,
    resolved_by: resolvedBy ?? null,
  });
  if (logError) throw logError;
}
