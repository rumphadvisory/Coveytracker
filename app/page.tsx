import Image from "next/image";
import LoginForm from "@/components/LoginForm";
import { supabaseConfigured } from "@/lib/supabase/env";

export default function Landing({ searchParams }: { searchParams: { next?: string; error?: string } }) {
  const configured = supabaseConfigured;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <Image src="/logo.png" alt="CoveyTracker" width={300} height={200} priority className="mx-auto h-auto w-64" />
        <p className="mt-3 text-bark">
          GPS covey mapping, dog performance, and harvest tracking for managed quail plantations.
        </p>
      </div>

      <div className="card">
        {configured ? (
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

      <ul className="mt-6 grid grid-cols-2 gap-3 text-sm text-bark">
        {[
          ["location_on", "Mark coveys by GPS"],
          ["pets", "Track dog contacts"],
          ["partly_cloudy_day", "Auto-fill weather"],
          ["monitoring", "Harvest budgets"],
        ].map(([icon, text]) => (
          <li key={text} className="flex items-center gap-2">
            <span className="material-symbols-outlined text-forest">{icon}</span>
            {text}
          </li>
        ))}
      </ul>
    </main>
  );
}
