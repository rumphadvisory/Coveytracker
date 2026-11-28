import Image from "next/image";
import Link from "next/link";
import LoginForm from "@/components/LoginForm";
import { supabaseConfigured } from "@/lib/supabase/env";

export const metadata = { title: "Beta sign-in · CoveyTracker" };

export default function LoginPage({ searchParams }: { searchParams: { next?: string; error?: string } }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <Link href="/" aria-label="CoveyTracker home">
          <Image src="/logo-mark.png" alt="CoveyTracker" width={512} height={512} priority className="mx-auto h-28 w-28" />
        </Link>
        <p className="mt-3 text-sm text-bark">Private beta. Sign in with the email you were invited with.</p>
      </div>

      <div className="card">
        {supabaseConfigured ? (
          <LoginForm next={searchParams.next} initialError={searchParams.error} />
        ) : (
          <div className="space-y-2 text-sm">
            <h2 className="h-section">Setup needed</h2>
            <p>
              Supabase isn&apos;t configured. Copy <code>.env.example</code> to <code>.env.local</code>, add your project
              URL and anon key, and restart the dev server. See the README for the full setup.
            </p>
          </div>
        )}
      </div>

      <p className="mt-6 text-center text-sm text-bark">
        Not in the beta yet?{" "}
        <Link href="/#waitlist" className="font-semibold text-forest underline">
          Join the waiting list
        </Link>
      </p>
    </main>
  );
}
