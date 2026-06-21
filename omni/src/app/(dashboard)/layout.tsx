import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { DashboardSidebar } from "./_components/dashboard-sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Middleware does the optimistic cookie gate; this is the authoritative
  // server-side check that also gives us the operator identity for the shell.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar
        userName={session.user.name ?? null}
        userEmail={session.user.email}
      />
      <div className="min-w-0 flex-1">
        <main className="mx-auto w-full max-w-6xl px-6 py-10 lg:px-10">{children}</main>
      </div>
    </div>
  );
}
