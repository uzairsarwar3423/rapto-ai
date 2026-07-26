import { redirect } from "next/navigation";

/**
 * Root Application Page
 *
 * Landing page has been moved to a separate repository/application (e.g. rapto.cloud).
 * Root route / automatically redirects to the protected /dashboard.
 */
export default function RootPage() {
  redirect("/dashboard");
}
