import { supabase } from "@/lib/supabase";

export type PlanExercise = {
  id: string;
  name: string;
  sets: number;
  reps: number;
  order_index: number;
};

export async function getPlanExercises(userId: string): Promise<PlanExercise[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("workout_plan_exercises")
    .select("id, name, sets, reps, order_index")
    .eq("user_id", userId)
    .order("order_index", { ascending: true });
  if (error) return [];
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    sets: r.sets,
    reps: r.reps,
    order_index: r.order_index,
  }));
}

export async function addPlanExercise(
  userId: string,
  exercise: { name: string; sets: number; reps: number }
): Promise<PlanExercise | null> {
  if (!supabase) return null;
  const { data: existing } = await supabase
    .from("workout_plan_exercises")
    .select("order_index")
    .eq("user_id", userId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (existing?.order_index ?? -1) + 1;
  const { data, error } = await supabase
    .from("workout_plan_exercises")
    .insert({
      user_id: userId,
      name: exercise.name,
      sets: exercise.sets,
      reps: exercise.reps,
      order_index: nextOrder,
    })
    .select("id, name, sets, reps, order_index")
    .single();
  if (error) return null;
  return data
    ? {
        id: data.id,
        name: data.name,
        sets: data.sets,
        reps: data.reps,
        order_index: data.order_index,
      }
    : null;
}

export async function updatePlanExercise(
  userId: string,
  id: string,
  updates: { sets?: number; reps?: number }
): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from("workout_plan_exercises")
    .update(updates)
    .eq("id", id)
    .eq("user_id", userId);
  return !error;
}

export async function removePlanExercise(userId: string, id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from("workout_plan_exercises")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  return !error;
}
