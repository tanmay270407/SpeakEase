import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import { 
  Users, 
  Search, 
  RefreshCw, 
  ShieldCheck, 
  UserCheck, 
  Stethoscope, 
  Calendar, 
  Clock, 
  Phone, 
  Mail,
  AlertCircle,
  Sparkles
} from "lucide-react";
import { Button } from "../../components/ui/Button";
import { AdminUser, UserRole } from "../../types/supabase";

export function AdminUsersPage() {
  const { session, profile, isDemoAccount } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRole, setSelectedRole] = useState<"ALL" | UserRole>("ALL");

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);

    try {
      // 1. Try server-side authenticated admin endpoint first
      const token = session?.access_token;
      let fetched = false;

      if (token) {
        try {
          const res = await fetch("/api/admin/users", {
            headers: {
              Authorization: `Bearer ${token}`
            }
          });
          if (res.ok) {
            const json = await res.json();
            if (Array.isArray(json.users)) {
              setUsers(json.users);
              fetched = true;
            }
          }
        } catch (fetchErr) {
          console.warn("Server admin fetch attempt note:", fetchErr);
        }
      }

      // 2. Fallback to Supabase RPC get_admin_users
      if (!fetched) {
        const { data: rpcData, error: rpcErr } = await supabase.rpc("get_admin_users");
        if (!rpcErr && rpcData) {
          setUsers(rpcData as AdminUser[]);
          fetched = true;
        }
      }

      // 3. Fallback to querying profiles table directly (permitted by admin RLS policy)
      if (!fetched) {
        const { data: profilesData, error: profilesErr } = await supabase
          .from("profiles")
          .select("*")
          .order("created_at", { ascending: false });

        if (profilesErr) throw profilesErr;

        setUsers(
          (profilesData || []).map((p: any) => ({
            id: p.id,
            user_id: p.user_id || p.id,
            full_name: p.full_name,
            email: p.email,
            role: p.role,
            phone: p.phone,
            created_at: p.created_at,
            last_sign_in_at: null,
          }))
        );
      }
    } catch (err: any) {
      console.error("Error fetching admin users:", err);
      setError(err?.message || "Failed to load user directory");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [session]);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesRole = selectedRole === "ALL" || u.role === selectedRole;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = 
        !q ||
        u.full_name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        (u.phone && u.phone.toLowerCase().includes(q));
      return matchesRole && matchesSearch;
    });
  }, [users, selectedRole, searchQuery]);

  const stats = useMemo(() => {
    const total = users.length;
    const patients = users.filter((u) => u.role === "USER").length;
    const slps = users.filter((u) => u.role === "SLP").length;
    const admins = users.filter((u) => u.role === "ADMIN").length;
    return { total, patients, slps, admins };
  }, [users]);

  const formatRole = (role: UserRole) => {
    switch (role) {
      case "USER":
        return {
          label: "Patient",
          color: "bg-blue-50 text-blue-700 border-blue-200",
          icon: <UserCheck className="h-3.5 w-3.5 text-blue-600" />
        };
      case "SLP":
        return {
          label: "Clinician (SLP)",
          color: "bg-teal-50 text-teal-700 border-teal-200",
          icon: <Stethoscope className="h-3.5 w-3.5 text-teal-600" />
        };
      case "ADMIN":
        return {
          label: "Administrator",
          color: "bg-purple-50 text-purple-700 border-purple-200",
          icon: <ShieldCheck className="h-3.5 w-3.5 text-purple-600" />
        };
      default:
        return {
          label: role,
          color: "bg-slate-100 text-slate-700 border-slate-200",
          icon: null
        };
    }
  };

  const formatDate = (iso?: string | null) => {
    if (!iso) return "—";
    try {
      const date = new Date(iso);
      if (isNaN(date.getTime())) return "—";
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "—";
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-sm">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-slate-900">User Management Directory</h1>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                  <ShieldCheck className="h-3 w-3" />
                  Admin Protected
                </span>
              </div>
              <p className="text-xs text-slate-500">
                System identity records from profiles table with authenticated user associations
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isDemoAccount && (
              <Link to="/demo-role">
                <Button variant="outline" size="sm" className="flex items-center gap-1.5 text-xs text-amber-900 bg-amber-50 border-amber-300 hover:bg-amber-100">
                  <Sparkles className="h-3.5 w-3.5 text-amber-700" />
                  Demo Switcher
                </Button>
              </Link>
            )}
            <Link to="/dashboard">
              <Button variant="outline" size="sm" className="text-xs">
                Patient App
              </Button>
            </Link>
            <Link to="/slp">
              <Button variant="outline" size="sm" className="text-xs">
                SLP App
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchUsers}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-purple-600" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Metric Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Total Users</span>
              <Users className="h-4 w-4 text-slate-400" />
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-2">{stats.total}</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-blue-600">Patients</span>
              <UserCheck className="h-4 w-4 text-blue-500" />
            </div>
            <p className="text-2xl font-bold text-blue-900 mt-2">{stats.patients}</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-teal-600">Clinicians (SLP)</span>
              <Stethoscope className="h-4 w-4 text-teal-500" />
            </div>
            <p className="text-2xl font-bold text-teal-900 mt-2">{stats.slps}</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-purple-600">Administrators</span>
              <ShieldCheck className="h-4 w-4 text-purple-500" />
            </div>
            <p className="text-2xl font-bold text-purple-900 mt-2">{stats.admins}</p>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Role Filter Chips */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setSelectedRole("ALL")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedRole === "ALL"
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              All ({stats.total})
            </button>
            <button
              onClick={() => setSelectedRole("USER")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedRole === "USER"
                  ? "bg-blue-600 text-white"
                  : "bg-blue-50 text-blue-700 hover:bg-blue-100"
              }`}
            >
              Patients ({stats.patients})
            </button>
            <button
              onClick={() => setSelectedRole("SLP")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedRole === "SLP"
                  ? "bg-teal-600 text-white"
                  : "bg-teal-50 text-teal-700 hover:bg-teal-100"
              }`}
            >
              Clinicians ({stats.slps})
            </button>
            <button
              onClick={() => setSelectedRole("ADMIN")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedRole === "ADMIN"
                  ? "bg-purple-600 text-white"
                  : "bg-purple-50 text-purple-700 hover:bg-purple-100"
              }`}
            >
              Admins ({stats.admins})
            </button>
          </div>

          {/* Search Input */}
          <div className="relative sm:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search name, email, phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-purple-500 focus:bg-white transition-all"
            />
          </div>
        </div>

        {/* Error message if any */}
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold">Unable to fetch users</p>
              <p className="text-xs text-red-600 mt-0.5">{error}</p>
            </div>
            <Button size="sm" variant="outline" onClick={fetchUsers} className="text-xs text-red-700 border-red-300 hover:bg-red-100">
              Retry
            </Button>
          </div>
        )}

        {/* User Directory Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
                  <th className="py-3.5 px-4">Full Name</th>
                  <th className="py-3.5 px-4">Email</th>
                  <th className="py-3.5 px-4">Phone</th>
                  <th className="py-3.5 px-4">Account Type</th>
                  <th className="py-3.5 px-4">Created At</th>
                  <th className="py-3.5 px-4">Last Sign In</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {loading && users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <RefreshCw className="h-5 w-5 animate-spin text-purple-600" />
                        <span>Loading user directory...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Users className="h-6 w-6 text-slate-300" />
                        <span className="font-medium text-slate-600">No users found</span>
                        <span className="text-xs text-slate-400">
                          {searchQuery ? "Try refining your search query" : "No user accounts registered under this role"}
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => {
                    const roleInfo = formatRole(user.role);
                    return (
                      <tr key={user.id} className="hover:bg-slate-50/60 transition-colors">
                        {/* Full Name */}
                        <td className="py-3.5 px-4 font-medium text-slate-900">
                          <div className="flex items-center gap-2.5">
                            <div className="h-8 w-8 rounded-full bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center font-semibold text-xs shrink-0">
                              {(user.full_name || user.email || "?").charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-semibold text-slate-900">{user.full_name || "—"}</div>
                              <div className="text-[11px] text-slate-400 font-mono">
                                id: {user.user_id ? user.user_id.slice(0, 8) + "..." : user.id.slice(0, 8) + "..."}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Email */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1.5 text-slate-700">
                            <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span className="font-mono text-xs">{user.email}</span>
                          </div>
                        </td>

                        {/* Phone */}
                        <td className="py-3.5 px-4">
                          {user.phone ? (
                            <div className="flex items-center gap-1.5 text-slate-800 font-medium">
                              <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                              <span>{user.phone}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Not provided</span>
                          )}
                        </td>

                        {/* Account Type */}
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${roleInfo.color}`}
                          >
                            {roleInfo.icon}
                            {roleInfo.label}
                          </span>
                        </td>

                        {/* Created At */}
                        <td className="py-3.5 px-4 text-slate-600">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span>{formatDate(user.created_at)}</span>
                          </div>
                        </td>

                        {/* Last Sign In */}
                        <td className="py-3.5 px-4 text-slate-600">
                          {user.last_sign_in_at ? (
                            <div className="flex items-center gap-1.5">
                              <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                              <span>{formatDate(user.last_sign_in_at)}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Never signed in</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="bg-slate-50 px-4 py-3 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
            <span>
              Displaying <strong className="text-slate-700">{filteredUsers.length}</strong> of{" "}
              <strong className="text-slate-700">{users.length}</strong> registered user(s)
            </span>
            <span className="text-[11px] text-slate-400">
              Security note: Password hashes and secrets are strictly excluded from administrative payloads.
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}
