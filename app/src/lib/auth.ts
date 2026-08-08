import { supabase, setCompanyId } from "./supabase";

export type AuthProfile = { id: string; email: string; companyId: string };

export async function loadProfile(): Promise<AuthProfile | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    setCompanyId("");
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, company_id, email")
    .eq("id", session.user.id)
    .single();

  if (!profile) {
    setCompanyId("");
    return null;
  }

  setCompanyId(profile.company_id);
  return { id: profile.id, email: profile.email, companyId: profile.company_id };
}

export async function signUp(email: string, password: string, companyName: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { company_name: companyName } },
  });
  if (error) throw error;
  return { needsEmailConfirmation: !data.session };
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
  setCompanyId("");
}
