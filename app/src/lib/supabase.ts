import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Défini dynamiquement après connexion (voir lib/auth.ts). Reste vide tant
// que personne n'est authentifié. Les imports nommés de ce module lisent
// toujours la valeur à jour (liaison ES live), donc aucun autre fichier n'a
// besoin d'être modifié pour bénéficier de la valeur par entreprise connectée.
export let COMPANY_ID = "";

export function setCompanyId(id: string) {
  COMPANY_ID = id;
}
