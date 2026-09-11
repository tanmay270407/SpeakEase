import { useState, useEffect } from "react";
import { Activity, AlertTriangle, CheckCircle, HelpCircle, Clock } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";

type WorkflowLog = {
  id: string;
  workflow: string;
  status: string;
  details?: string;
  executedAt: string;
};

export function SLPWorkflows() {
  const [logs, setLogs] = useState<WorkflowLog[]>([]);
  const [loading, setLoading] = useState(true);
  const { session } = useAuth();

  useEffect(() => {
    async function loadLogs() {
      try {
        const response = await fetch("/api/slp/workflows/logs", {
          headers: {
            "Authorization": `Bearer ${session?.access_token}`
          }
        });
        if (!response.ok) throw new Error("Failed to fetch logs");
        const data = await response.json();
        
        // Group by workflow to show latest status
        const uniqueWorkflows = new Map<string, WorkflowLog>();
        (data.logs || []).forEach((log: WorkflowLog) => {
          if (!uniqueWorkflows.has(log.workflow)) {
            uniqueWorkflows.set(log.workflow, log);
          }
        });

        setLogs(Array.from(uniqueWorkflows.values()));
      } catch (err) {
        console.error("Failed to load workflow logs:", err);
      } finally {
        setLoading(false);
      }
    }

    if (session?.access_token) {
      loadLogs();
    }
  }, [session]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "Success":
        return <CheckCircle className="w-5 h-5 text-emerald-500" />;
      case "Failed":
        return <AlertTriangle className="w-5 h-5 text-red-500" />;
      case "Not configured":
        return <HelpCircle className="w-5 h-5 text-amber-500" />;
      default:
        return <Clock className="w-5 h-5 text-slate-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Success":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "Failed":
        return "bg-red-50 text-red-700 border-red-200";
      case "Not configured":
        return "bg-amber-50 text-amber-700 border-amber-200";
      default:
        return "bg-slate-50 text-slate-700 border-slate-200";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto py-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
          <Activity className="w-6 h-6 text-indigo-600" />
          Corsair Workflows (Admin)
        </h1>
        <p className="text-slate-500 mt-1">
          Monitor the status of internal background automations and triggers.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Workflow Name
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Status
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Last Execution
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Details
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {logs.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-sm text-slate-500 italic">
                  No workflows have executed yet. Complete a practice session to trigger the first one.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-medium text-slate-900">{log.workflow}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(log.status)}`}>
                      {getStatusIcon(log.status)}
                      {log.status}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                    {new Date(log.executedAt).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500 max-w-xs truncate" title={log.details}>
                    {log.details || "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
