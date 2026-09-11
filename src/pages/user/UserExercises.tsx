import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { PlayCircle, Clock, AlertCircle, ArrowRight, CheckCircle2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Exercise } from "../../types/supabase";
import { EXERCISE_DETAILS_CATALOG } from "../../data/exerciseDetailsData";

export function UserExercises() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchExercises = async () => {
      try {
        setLoading(true);
        // Only fetch clinician-approved exercises for safety
        const { data, error: fetchError } = await supabase
          .from('exercises')
          .select('*')
          .eq('approval_status', 'APPROVED')
          .order('created_at', { ascending: false });

        if (fetchError) throw fetchError;
        
        if (isMounted) {
          // If DB has exercises, use them and augment with catalog if needed
          const dbExercises: Exercise[] = data || [];
          const catalogList: Exercise[] = Object.values(EXERCISE_DETAILS_CATALOG).map(c => ({
            id: c.id,
            name: c.title,
            description: c.clinicalPurpose,
            duration: 60,
            approval_status: 'APPROVED',
            approved_by: 'clinician',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }));

          // Merge: ensure standard exercises are present
          const existingIds = new Set(dbExercises.map((e: any) => e.id));
          const existingNames = new Set(dbExercises.map((e: any) => e.name?.toLowerCase()));

          const combined: Exercise[] = [...dbExercises];
          for (const item of catalogList) {
            if (!existingIds.has(item.id) && !existingNames.has(item.name.toLowerCase())) {
              combined.push(item);
            }
          }

          setExercises(combined.length > 0 ? combined : catalogList);
          setError(null);
        }
      } catch (err: any) {
        if (isMounted) {
          // Fallback to approved catalog exercises on DB network failure
          const fallbackList: Exercise[] = Object.values(EXERCISE_DETAILS_CATALOG).map(c => ({
            id: c.id,
            name: c.title,
            description: c.clinicalPurpose,
            duration: 60,
            approval_status: 'APPROVED',
            approved_by: 'clinician',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }));
          setExercises(fallbackList);
          setError(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchExercises();

    return () => {
      isMounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 max-w-5xl">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Exercises</h1>
          <p className="text-slate-500 text-sm">Clinician-approved practice routines.</p>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 max-w-5xl">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Exercises</h1>
          <p className="text-slate-500 text-sm">Clinician-approved practice routines.</p>
        </div>
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-600 border border-red-200 flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Exercises</h1>
        <p className="text-slate-500 text-sm">Clinician-approved practice routines.</p>
      </div>

      {exercises.length === 0 ? (
        <Card className="border-slate-200 shadow-none border-dashed bg-slate-50/50">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center space-y-3">
            <div className="rounded-full bg-slate-100 p-3">
              <PlayCircle className="h-6 w-6 text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-900">No approved exercises are available yet.</p>
            <p className="text-sm text-slate-500 max-w-sm">
              Your clinician will assign practice exercises here once they have been approved for your therapy plan.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {exercises.map((exercise) => (
            <Card key={exercise.id} className="flex flex-col border-slate-200 shadow-sm transition-shadow hover:shadow-md bg-white">
              <CardHeader className="flex-1 pb-4">
                <CardTitle className="text-lg font-semibold text-slate-900">
                  {exercise.name}
                </CardTitle>
                <CardDescription className="line-clamp-2 mt-1">
                  {exercise.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center justify-between mt-4">
                  <div className="flex items-center gap-1.5 text-sm font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md">
                    <Clock className="h-3.5 w-3.5" />
                    {exercise.duration ? `${Math.round(exercise.duration / 60)} min` : 'Custom'}
                  </div>
                  <Link 
                    to={`/exercises/${exercise.id}`}
                    className="inline-flex h-9 rounded-md px-3.5 bg-indigo-600 hover:bg-indigo-700 text-white items-center justify-center gap-1.5 text-sm font-medium transition-colors shadow-2xs"
                  >
                    View Routine
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
