import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "../../components/ui/Card";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { Users, ChevronRight, User } from "lucide-react";

export function SLPPatients() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [patients, setPatients] = useState<any[]>([]);

  useEffect(() => {
    async function loadPatients() {
      try {
        setLoading(true);
        if (!profile?.id) return;

        const { data: slpData } = await (supabase.from('slps') as any)
          .select('id')
          .eq('user_id', profile.id)
          .single();

        if (!slpData) return;

        const { data: assignments } = await (supabase.from('patient_assignments') as any)
          .select(`
            patient_id,
            assigned_at,
            profiles!patient_assignments_patient_id_fkey (
              id,
              full_name,
              email
            )
          `)
          .eq('slp_id', slpData.id);

        const formattedPatients = assignments?.map((a: any) => ({
          ...a.profiles,
          assigned_at: a.assigned_at
        })) || [];

        setPatients(formattedPatients);

      } catch (err) {
        console.error("Error loading patients:", err);
      } finally {
        setLoading(false);
      }
    }

    loadPatients();
  }, [profile?.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="space-y-1 pb-2">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">My Patients</h1>
        <p className="text-slate-500 text-sm">Manage your assigned patients and view their progress.</p>
      </div>

      <Card>
        <CardContent className="p-0">
          {patients.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500 italic">
              No patients assigned to you yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {patients.map((patient) => (
                <Link 
                  key={patient.id}
                  to={`/slp/patients/${patient.id}`}
                  className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                      <User className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-medium text-slate-900">{patient.full_name}</div>
                      <div className="text-sm text-slate-500">{patient.email}</div>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400" />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
