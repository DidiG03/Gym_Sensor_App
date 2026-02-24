# Supabase Setup

## 1. Workout Plan Tables

Run the migration to create the plan table:

1. Go to **SQL Editor**
2. Copy and paste the contents of `migrations/20250206000000_workout_plan_exercises.sql`
3. Click **Run**

This creates the `workout_plan_exercises` table with Row Level Security so users can only access their own plan.
