import fs from 'fs';

let content = fs.readFileSync('src/pages/slp/SLPDashboard.tsx', 'utf8');

const target = `            if (!corsairRes.ok) {
              const errData = await corsairRes.json();
              throw new Error(errData.details || "Corsair API unavailable");
            }
            // If we actually had the spec, we would parse and set state here.
            // Since it throws 501, we will catch it below.
          }
        } catch (cErr: any) {`;

const replacement = `            if (!corsairRes.ok) {
              const errData = await corsairRes.json();
              throw new Error(errData.error || errData.details || "Corsair API unavailable");
            }
            const dashboardData = await corsairRes.json();
            setPatientCount(dashboardData.patientCount);
            setSessionCount(dashboardData.sessionCount);
            setNeedsReviewSessions(dashboardData.needsReviewSessions);
            setCorsairError(null);
            setLoading(false);
            return;
          }
        } catch (cErr: any) {`;

content = content.replace(target, replacement);
fs.writeFileSync('src/pages/slp/SLPDashboard.tsx', content);
console.log('Fixed SLPDashboard.tsx');
