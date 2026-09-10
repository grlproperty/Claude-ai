import { requireUser } from '../../server/session';
import { getStaff } from '../../server/snapshot';
import { require_ } from '../../server/permissions';
import { Shell } from '../../components/shell';
import { Card } from '../../components/ui';

export const dynamic = 'force-dynamic';

/**
 * Staff operations (§22). Workload is derived from real open work, not
 * self-reported, so the delegation engine and this page agree.
 */
export default async function StaffPage() {
  const user = await requireUser();
  require_(user, 'view:department');

  const staff = await getStaff();
  const visible = user.isCeo ? staff : staff.filter((s) => s.department === user.department);

  return (
    <Shell
      user={user}
      current="/staff"
      title="Staff"
      lede="Workload is measured from open work with an estimate attached, so the delegation engine and this page tell the same story."
    >
      <Card title="Team" count={visible.length}>
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-micro uppercase tracking-[0.12em] text-ink-muted">
                <th className="px-1 pb-2 font-semibold">Name</th>
                <th className="px-1 pb-2 font-semibold">Responsibility</th>
                <th className="px-1 pb-2 font-semibold">Committed</th>
                <th className="px-1 pb-2 font-semibold">Overdue</th>
                <th className="px-1 pb-2 font-semibold">Available</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => {
                const load = s.weeklyCapacityHours > 0 ? s.committedHours / s.weeklyCapacityHours : 1;
                return (
                  <tr key={s.id} className="border-b border-line/70 last:border-0">
                    <td className="px-1 py-2.5 font-medium">{s.name}</td>
                    <td className="px-1 py-2.5 text-ink-soft">
                      {s.isCeo ? 'Chief executive' : s.role.replace(/_/g, ' ').toLowerCase()} · {s.department.toLowerCase()}
                    </td>
                    <td className="px-1 py-2.5 tabular-nums">
                      <span className={load > 1 ? 'font-semibold text-maroon' : ''}>{Math.round(load * 100)}%</span>
                      <span className="ml-1.5 text-xs text-ink-muted">
                        {s.committedHours.toFixed(1)} / {s.weeklyCapacityHours} h
                      </span>
                    </td>
                    <td className="px-1 py-2.5 tabular-nums">
                      <span className={s.overdueCount > 0 ? 'font-semibold text-maroon' : 'text-ink-muted'}>{s.overdueCount}</span>
                    </td>
                    <td className="px-1 py-2.5 text-ink-soft">
                      {!s.active ? 'Inactive' : s.away ? 'Away' : s.acceptsDelegation ? 'Yes' : 'Not taking work'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-4 rule pt-3 text-xs leading-relaxed text-ink-muted">
          A person at or over 100% is not given more work by the delegation engine unless they already own the
          relationship — and when that happens the overload is stated in the routing reason rather than hidden.
        </p>
      </Card>
    </Shell>
  );
}
