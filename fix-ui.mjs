import fs from 'fs';

let content = fs.readFileSync('src/pages/slp/SLPDashboard.tsx', 'utf8');

// 1. Add states
const statesTarget = `  const [needsReviewSessions, setNeedsReviewSessions] = useState<any[]>([]);
  const [corsairError, setCorsairError] = useState<string | null>(null);`;
const statesReplacement = `  const [needsReviewSessions, setNeedsReviewSessions] = useState<any[]>([]);
  const [inactivePatients, setInactivePatients] = useState<any[]>([]);
  const [recentSessions, setRecentSessions] = useState<any[]>([]);
  const [speechMetrics, setSpeechMetrics] = useState<any[]>([]);
  const [corsairError, setCorsairError] = useState<string | null>(null);`;
content = content.replace(statesTarget, statesReplacement);

// 2. Set states in Corsair fetch block
const setTarget = `            setNeedsReviewSessions(dashboardData.needsReviewSessions);
            setCorsairError(null);`;
const setReplacement = `            setNeedsReviewSessions(dashboardData.needsReviewSessions);
            setInactivePatients(dashboardData.inactivePatients || []);
            setRecentSessions(dashboardData.recentSessions || []);
            setSpeechMetrics(dashboardData.speechMetrics || []);
            setCorsairError(null);`;
content = content.replace(setTarget, setReplacement);

// 3. Render the new UI
// We have <Card>...Needs Review...</Card>
// Let's replace it with a grid of cards.
const uiTarget = `      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Needs Review</CardTitle>
          <CardDescription>Sessions awaiting your clinical observation.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {needsReviewSessions.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500 italic">
              All caught up! No sessions pending review.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {needsReviewSessions.map((session) => (
                <Link 
                  key={session.id}
                  to={\`/slp/patients/\${session.user_id}\`}
                  className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="font-medium text-slate-900">
                      {session.profiles?.full_name || 'Patient'}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-slate-500">
                      <span>{new Date(session.created_at).toLocaleDateString()}</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {Math.floor(session.duration / 60)}:{String(session.duration % 60).padStart(2, '0')}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 font-normal">Pending</Badge>
                    <ChevronRight className="w-5 h-5 text-slate-400" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}`;

const uiReplacement = `      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Needs Review</CardTitle>
            <CardDescription>Sessions awaiting your clinical observation.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {needsReviewSessions.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500 italic">
                All caught up! No sessions pending review.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {needsReviewSessions.map((session) => (
                  <Link 
                    key={session.id}
                    to={\`/slp/patients/\${session.user_id}\`}
                    className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="font-medium text-slate-900">
                        {session.profiles?.full_name || 'Patient'}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-slate-500">
                        <span>{new Date(session.created_at).toLocaleDateString()}</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {Math.floor(session.duration / 60)}:{String(session.duration % 60).padStart(2, '0')}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 font-normal">Pending</Badge>
                      <ChevronRight className="w-5 h-5 text-slate-400" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Sessions</CardTitle>
            <CardDescription>Latest patient activity.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {recentSessions.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500 italic">
                No recent sessions found.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {recentSessions.slice(0, 5).map((session) => (
                  <Link 
                    key={session.id}
                    to={\`/slp/patients/\${session.user_id}\`}
                    className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="font-medium text-slate-900">
                        {session.profiles?.full_name || 'Patient'}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-slate-500">
                        <span>{new Date(session.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-400" />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Inactive Patients</CardTitle>
            <CardDescription>Patients with no sessions in 7 days.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {inactivePatients.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500 italic">
                All patients are active.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {inactivePatients.map((patient) => (
                  <Link 
                    key={patient.patient_id}
                    to={\`/slp/patients/\${patient.patient_id}\`}
                    className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
                  >
                    <div className="font-medium text-slate-900">
                      {patient.profiles?.full_name || 'Patient'}
                    </div>
                    <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-200 font-normal">Inactive</Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Speech Metrics</CardTitle>
            <CardDescription>Metrics from latest sessions.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {speechMetrics.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500 italic">
                No metrics found.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {speechMetrics.slice(0, 5).map((metric) => (
                  <div key={metric.id} className="p-4 space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500">Fluency</span>
                      <span className="font-medium">{metric.fluency_score.toFixed(1)}/10</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5">
                      <div className="bg-indigo-600 h-1.5 rounded-full" style={{ width: \`\${(metric.fluency_score / 10) * 100}%\` }} />
                    </div>
                    <div className="flex justify-between items-center text-sm pt-2">
                      <span className="text-slate-500">Articulation</span>
                      <span className="font-medium">{metric.articulation_score.toFixed(1)}/10</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5">
                      <div className="bg-teal-600 h-1.5 rounded-full" style={{ width: \`\${(metric.articulation_score / 10) * 100}%\` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}`;

content = content.replace(uiTarget, uiReplacement);
fs.writeFileSync('src/pages/slp/SLPDashboard.tsx', content);
console.log('Fixed SLPDashboard.tsx UI');
