# Supabase Setup

## Workout Plan Tables

To enable saving workout plans to the database, run the migration in your Supabase project:

1. Open your [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Go to **SQL Editor**
4. Copy and paste the contents of `migrations/20250206000000_workout_plan_exercises.sql`
5. Click **Run**

This creates the `workout_plan_exercises` table with Row Level Security so users can only access their own plan.
