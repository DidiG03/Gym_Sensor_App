-- Workout plan exercises: each row is one exercise in the user's saved plan
create table if not exists public.workout_plan_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sets int not null default 3 check (sets >= 1 and sets <= 20),
  reps int not null default 10 check (reps >= 1 and reps <= 50),
  order_index int not null default 0,
  created_at timestamptz not null default now()
);

-- Index for fast lookups by user
create index if not exists idx_workout_plan_exercises_user_id
  on public.workout_plan_exercises(user_id);

-- RLS: users can only access their own exercises
alter table public.workout_plan_exercises enable row level security;

create policy "Users can view own plan exercises"
  on public.workout_plan_exercises for select
  using (auth.uid() = user_id);

create policy "Users can insert own plan exercises"
  on public.workout_plan_exercises for insert
  with check (auth.uid() = user_id);

create policy "Users can update own plan exercises"
  on public.workout_plan_exercises for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own plan exercises"
  on public.workout_plan_exercises for delete
  using (auth.uid() = user_id);
