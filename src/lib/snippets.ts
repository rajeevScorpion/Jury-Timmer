import { supabase } from "@/lib/supabase";
import type { FeedbackSnippet, CreateSnippetInput } from "@/types/snippet";

export async function fetchSnippets(
  scope?: string,
): Promise<FeedbackSnippet[]> {
  let query = supabase
    .from("feedback_snippets")
    .select("*")
    .order("updated_at", { ascending: false });

  if (scope && scope !== "all") {
    query = query.in("scope", [scope, "general"]);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message || "Failed to load snippets.");
  return (data as FeedbackSnippet[]) ?? [];
}

export async function createSnippet(
  input: CreateSnippetInput,
): Promise<FeedbackSnippet> {
  const { data, error } = await supabase
    .from("feedback_snippets")
    .insert({ text: input.text, label: input.label, scope: input.scope })
    .select()
    .single();

  if (error) throw new Error(error.message || "Failed to save snippet.");
  return data as FeedbackSnippet;
}

export async function updateSnippetScope(
  id: string,
  scope: string,
): Promise<void> {
  const { error } = await supabase
    .from("feedback_snippets")
    .update({ scope, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(error.message || "Failed to update snippet.");
}

export async function deleteSnippet(id: string): Promise<void> {
  const { error } = await supabase
    .from("feedback_snippets")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message || "Failed to delete snippet.");
}
