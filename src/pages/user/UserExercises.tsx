import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { ListSkeleton } from "../../components/ui/Skeleton";
import { PlayCircle, Clock, AlertCircle, ArrowRight, CheckCircle2, BookOpen, Mic, Sparkles } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { Exercise } from "../../types/supabase";
import { EXERCISE_DETAILS_CATALOG } from "../../data/exerciseDetailsData";

export function UserExercises() {
  const { profile } = useAuth();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchPatientExercises = async () => {
      try {
        setLoading(true);
        if (!profile?.id) return;

        // Fetch only exercises that have been explicitly enabled for this patient by their SLP
        const { data: peData, error: peError } = await (supabase.from('patient_exercises') as any)
          .select(`
            id,
            patient_id,
            exercise_id,
            status,
            assigned_at,
            exercises:exercise_id (
              id,
              name,
              description,
              instructions,
              category,
              duration,
              status
            )
          `)
          .eq('patient_id', profile.id)
          .eq('status', 'enabled');

        if (peError) throw peError;

        if (isMounted) {
          const enabledList: Exercise[] = [];

          if (peData && peData.length > 0) {
            for (const item of peData) {
              if (item.exercises) {
                const ex = item.exercises;
                const catalogDetail = EXERCISE_DETAILS_CATALOG[ex.id];
                enabledList.push({
                  id: ex.id,
                  name: ex.name || catalogDetail?.title || 'Exercise',
                  description: ex.description || catalogDetail?.clinicalPurpose || null,
                  instructions: ex.instructions || catalogDetail?.instructions?.join(' ') || null,
                  category: ex.category || 'Speech Routine',
                  duration: ex.duration || catalogDetail?.estimatedDurationSeconds || 60,
                  status: ex.status || 'active',
                  approval_status: 'APPROVED',
                  approved_by: null,
                  created_at: item.assigned_at || new Date().toISOString(),
                  updated_at: item.assigned_at || new Date().toISOString()
                });
              }
            }
          }

          setExercises(enabledList);
          setError(null);
        }
      } catch (err: any) {
        console.error("Failed to load patient exercises:", err);
        if (isMounted) {
          setError(err.message || "Failed to load assigned exercises.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchPatientExercises();

    return () => {
      isMounted = false;
    };
  }, [profile?.id]);

  if (loading) {
    return (
      <div className="space-y-6 max-w-5xl">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-indigo-600" />
            Prescribed Exercises
          </h1>
          <p className="text-slate-500 text-sm">
            Clinical speech therapy routines enabled by your Speech-Language Pathologist.
          </p>
        </div>
        <ListSkeleton count={4} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 max-w-5xl">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-indigo-600" />
            Prescribed Exercises
          </h1>
          <p className="text-slate-500 text-sm">
            Clinical speech therapy routines enabled by your Speech-Language Pathologist.
          </p>
        </div>
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700 border border-red-200 flex items-center gap-2.5">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-indigo-600" />
            Prescribed Exercises
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Targeted clinical speech and phonation routines enabled by your Speech-Language Pathologist.
          </p>
        </div>

        {exercises.length > 0 && (
          <Badge variant="outline" className="text-teal-700 bg-teal-50 border-teal-200 self-start sm:self-auto gap-1.5 py-1 px-3">
            <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
            {exercises.length} {exercises.length === 1 ? 'Routine' : 'Routines'} Assigned
          </Badge>
        )}
      </div>

      {exercises.length === 0 ? (
        <Card className="border-slate-200 shadow-xs border-dashed bg-slate-50/70 p-4">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center space-y-4 max-w-md mx-auto">
            <div className="rounded-full bg-indigo-50 p-4 border border-indigo-100">
              <PlayCircle className="h-8 w-8 text-indigo-600" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900">No Exercises Assigned Yet</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                Your Speech-Language Pathologist has not enabled any clinical exercise routines for your account at this time.
              </p>
            </div>
            <div className="pt-2 flex flex-col sm:flex-row items-center gap-3 w-full justify-center">
              <Link to="/practice" className="w-full sm:w-auto">
                <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
                  <Mic className="w-4 h-4" />
                  Go to General Practice
                </Button>
              </Link>
              <Link to="/my-slp" className="w-full sm:w-auto">
                <Button variant="outline" className="w-full text-slate-700">
                  View My SLP
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {exercises.map((exercise) => (
            <Card key={exercise.id} className="flex flex-col justify-between border-slate-200 shadow-xs hover:shadow-md hover:border-indigo-200 transition-all bg-white overflow-hidden group">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <Badge className="bg-indigo-50 text-indigo-700 border-indigo-100 text-[11px] font-medium">
                    {exercise.category || "Speech Routine"}
                  </Badge>
                  <span className="text-[11px] text-slate-500 flex items-center gap-1 font-mono">
                    <Clock className="w-3 h-3 text-slate-400" />
                    {exercise.duration ? `${Math.round(exercise.duration)}s` : '60s'}
                  </span>
                </div>
                <CardTitle className="text-lg font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                  {exercise.name}
                </CardTitle>
                <CardDescription className="line-clamp-2 mt-1 text-xs text-slate-600 leading-relaxed">
                  {exercise.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0 border-t border-slate-100 mt-2 bg-slate-50/40 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-emerald-700 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    Active Routine
                  </span>
                  <Link 
                    to={`/exercises/${exercise.id}`}
                    className="inline-flex h-8.5 rounded-lg px-3.5 bg-indigo-600 hover:bg-indigo-700 text-white items-center justify-center gap-1.5 text-xs font-semibold transition-colors shadow-2xs"
                  >
                    Start Routine
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

