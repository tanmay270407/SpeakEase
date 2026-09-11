import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { connectionService } from "../../services/connectionService";
import { SLPBookSessionModal } from "../../components/slp/SLPBookSessionModal";
import { TableRowSkeleton } from "../../components/ui/Skeleton";
import {
  Users,
  ChevronRight,
  User,
  Search,
  Inbox,
  UserPlus,
  Calendar,
  ShieldCheck,
  UserX,
  Video
} from "lucide-react";

export function SLPPatients() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [patients, setPatients] = useState<any[]>([]);
  const [slpId, setSlpId] = useState<string | null>(null);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);

  // Booking modal state
  const [bookingPatientId, setBookingPatientId] = useState<string | null>(null);
  const [isBookModalOpen, setIsBookModalOpen] = useState(false);

  const loadPatients = async () => {
    try {
      setLoading(true);
      if (!profile?.id) return;

      const { data: slpData } = await (supabase.from('slps') as any)
        .select('id')
        .eq('user_id', profile.id)
        .maybeSingle();

      if (!slpData) return;
      setSlpId(slpData.id);

      // Only fetch ACTIVE patient assignments
      const { data: assignments } = await (supabase.from('patient_assignments') as any)
        .select(`
          id,
          patient_id,
          assigned_at,
          status,
          profiles!patient_assignments_patient_id_fkey (
            id,
            full_name,
            email,
            created_at
          )
        `)
        .eq('slp_id', slpData.id)
        .eq('status', 'ACTIVE')
        .order('assigned_at', { ascending: false });

      const formattedPatients =
        assignments?.map((a: any) => ({
          ...a.profiles,
          assignmentId: a.id,
          assigned_at: a.assigned_at,
        })) || [];

      setPatients(formattedPatients);

      // Check pending received requests
      const { data: pendingReqs } = await (supabase.from('connection_requests') as any)
        .select('id')
        .eq('receiver_id', profile.id)
        .eq('status', 'pending');

      setPendingRequestsCount(pendingReqs?.length || 0);
    } catch (err) {
      console.error("Error loading patients:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPatients();
  }, [profile?.id]);

  if (loading) {
    return (
      <div className="space-y-6 max-w-5xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">My Patients</h1>
            <p className="text-slate-500 text-sm mt-1">
              Manage your connected patients and review their practice progress.
            </p>
          </div>
        </div>
        <Card className="border-slate-200 shadow-sm p-2">
          <TableRowSkeleton count={4} />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Top Header & Sub-nav */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">My Patients</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-100 text-teal-800">
              {patients.length} Active
            </span>
          </div>
          <p className="text-slate-500 text-sm mt-1">
            Manage your connected patients and review their practice progress and speech metrics.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/slp/find-patients"
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg bg-teal-600 hover:bg-teal-700 text-white transition-colors shadow-sm"
          >
            <UserPlus className="w-4 h-4" />
            Find Patients
          </Link>
          <Link
            to="/slp/requests"
            className="relative inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <Inbox className="w-4 h-4 text-teal-600" />
            Requests
            {pendingRequestsCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs font-bold bg-amber-500 text-white">
                {pendingRequestsCount}
              </span>
            )}
          </Link>
        </div>
      </div>

      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          {patients.length === 0 ? (
            <div className="p-12 text-center space-y-4 max-w-md mx-auto">
              <div className="h-14 w-14 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-600 mx-auto shadow-inner">
                <Users className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h3 className="font-semibold text-slate-900 text-base">No active patients</h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  You do not have any connected patients yet. Discover available patients and send invitations to start
                  monitoring their practice sessions.
                </p>
              </div>
              <div className="pt-2">
                <Link to="/slp/find-patients">
                  <Button className="bg-teal-600 hover:bg-teal-700 text-white text-sm">
                    <UserPlus className="w-4 h-4 mr-2" />
                    Browse Registered Patients
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {patients.map((patient) => (
                <div
                  key={patient.id}
                  className="flex items-center justify-between p-4 sm:p-5 hover:bg-slate-50/80 transition-colors group"
                >
                  <Link
                    to={`/slp/patients/${patient.id}`}
                    className="flex items-center gap-4 flex-1 min-w-0"
                  >
                    <div className="h-12 w-12 rounded-xl bg-teal-100 text-teal-700 font-bold flex items-center justify-center text-base shrink-0 shadow-inner">
                      {patient.full_name?.charAt(0) || 'P'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-900 text-sm group-hover:text-teal-600 transition-colors truncate">
                        {patient.full_name}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          Connected {new Date(patient.assigned_at).toLocaleDateString()}
                        </span>
                        <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-medium">
                          <ShieldCheck className="w-3 h-3" />
                          Active Connection
                        </span>
                      </div>
                    </div>
                  </Link>

                  <div className="flex items-center gap-2 pl-3">
                    <button
                      onClick={() => {
                        setBookingPatientId(patient.id);
                        setIsBookModalOpen(true);
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-2xs inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Video className="w-3.5 h-3.5" />
                      Book Live Session
                    </button>
                    <Link
                      to={`/slp/patients/${patient.id}`}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 transition-colors hidden sm:inline-flex items-center gap-1"
                    >
                      View Profile
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <SLPBookSessionModal
        isOpen={isBookModalOpen}
        onClose={() => {
          setIsBookModalOpen(false);
          setBookingPatientId(null);
        }}
        preselectedPatientId={bookingPatientId}
      />
    </div>
  );
}
