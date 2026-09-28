import { requireAdmin } from "@/lib/auth";
import { getUsersForAdmin } from "@/lib/leads/service";
import { startPerf } from "@/lib/perf";
import { AdminSettings } from "@/app/(crm)/admin/admin-settings";

export default async function AdminPage() {
  const endPage = startPerf("settings page total");
  const [user, users] = await Promise.all([requireAdmin(), getUsersForAdmin()]);
  endPage();
  return <AdminSettings users={users} currentUserId={user.id} />;
}
