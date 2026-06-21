import { redirect } from "next/navigation";

// The operator cockpit now exists (Batch 2), so the root sends straight to it.
// The middleware gate still applies — unauthenticated requests hit /login first.
export default function Home() {
  redirect("/projects");
}
