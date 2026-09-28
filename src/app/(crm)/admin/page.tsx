import { requireAdmin } from "@/lib/auth";
import { getUsersForAdmin } from "@/lib/leads/service";
import { AdminSettings } from "@/app/(crm)/admin/admin-settings";

export default async function AdminPage() {
  const [user, users] = await Promise.all([requireAdmin(), getUsersForAdmin()]);
  return <AdminSettings users={users} currentUserId={user.id} />;
}
