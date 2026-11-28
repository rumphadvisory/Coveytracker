import Image from "next/image";
import Link from "next/link";
import Icon from "@/components/Icon";
import WaitlistForm from "@/components/WaitlistForm";

export const metadata = {
  title: "CoveyTracker · Quail management intelligence",
  description: "Quail management intelligence: GPS covey mapping, dog performance and harvest analytics for managed quail plantations. Private beta.",
};

const FEATURES: [string, string, string][] = [
  ["my_location", "Mark coveys in the field", "Two big buttons, one hand. Every covey find and dog contact is GPS-stamped as it happens."],
  ["cloud_off", "Works with no signal", "Everything saves on the phone and uploads when you're back in range. Save the property's maps for offline use."],
  ["pets", "Dog performance", "Contacts, hours and contacts per hour for every dog, ranked by season."],
  ["polyline", "Courses on the map", "Outline parcels and courses from Google Earth, onX or Garmin files, or draw them. Acres calculated for you."],
  ["partly_cloudy_day", "Weather & scenting", "Conditions filled in automatically, a scenting rating, and which courses are producing the most coveys per hour."],
  ["speed", "Harvest budgets", "Fall covey counts set the population; see each course's harvest against a sustainable budget."],
];

export default function Home() {
  return (
    <div className="min-h-screen bg-sand">
      <header className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/logo-mark.png" alt="" width={40} height={40} className="h-10 w-10" />
          <span className="font-display text-lg">CoveyTracker</span>
        </Link>
        <nav className="ml-auto flex items-center gap-1">
          <Link href="/demo" className="btn-ghost hidden min-h-0 py-2 text-sm sm:inline-flex">
            See the demo
          </Link>
          <Link href="/login" className="btn-secondary min-h-0 px-3 py-2 text-sm">
            <Icon name="login" className="text-[18px]" /> Beta sign-in
          </Link>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-5xl px-4 pb-12 pt-6 text-center sm:pt-12">
          {/* Full logo for prominence on the home page; the square badge is used in the tab, header and app icon. */}
          <Image
            src="/logo-full.png"
            alt="CoveyTracker: GPS covey mapping and hunting-dog performance analytics for quail plantations"
            width={1000}
            height={718}
            priority
            className="mx-auto h-auto w-full max-w-sm sm:max-w-md"
          />
          <span className="mt-6 inline-block rounded-full bg-forest-light px-3 py-1 text-xs font-semibold uppercase tracking-wide text-forest-dark">
            Private beta
          </span>
          <p className="mt-4 text-sm font-semibold uppercase tracking-[0.18em] text-forest">
            Quail management intelligence
          </p>
          <h1 className="mx-auto mt-2 max-w-2xl font-display text-3xl leading-tight text-ink sm:text-5xl">
            Better birds. Better hunts. Every season.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-bark sm:text-lg">
            GPS covey mapping, dog performance and harvest analytics, built for the field and working where the
            signal doesn&apos;t.
          </p>
          <div className="mx-auto mt-6 flex max-w-sm flex-col gap-2 sm:max-w-none sm:flex-row sm:justify-center">
            <a href="#waitlist" className="btn-primary px-6">
              <Icon name="how_to_reg" /> Join the waiting list
            </a>
            <Link href="/demo" className="btn-secondary px-6">
              <Icon name="play_circle" /> See how it works
            </Link>
          </div>
        </section>

        {/* Features */}
        <section className="border-y border-line bg-white/60">
          <div className="mx-auto grid max-w-5xl gap-4 px-4 py-12 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(([icon, title, text]) => (
              <div key={title} className="card">
                <Icon name={icon} className="text-3xl text-forest" />
                <h2 className="mt-2 font-display text-lg">{title}</h2>
                <p className="mt-1 text-sm text-bark">{text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Field strip */}
        <section className="mx-auto max-w-5xl px-4 py-12">
          <div className="grid gap-6 rounded-3xl bg-forest p-6 text-white sm:grid-cols-3 sm:p-10">
            {[
              ["phone_iphone", "On the phone you already carry", "Add it to your home screen. No app store, no new gear."],
              ["groups", "For the whole crew", "Owners, managers and dog men, each with the right access."],
              ["lock", "Your data stays yours", "Each plantation's records are private to the people you invite."],
            ].map(([icon, t, d]) => (
              <div key={t}>
                <Icon name={icon} className="text-3xl text-[#e8d9a8]" />
                <h3 className="mt-2 font-display text-lg">{t}</h3>
                <p className="mt-1 text-sm text-white/80">{d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Waitlist */}
        <section id="waitlist" className="mx-auto max-w-2xl scroll-mt-6 px-4 pb-16">
          <div className="card p-6">
            <h2 className="text-center font-display text-2xl">Join the waiting list</h2>
            <p className="mx-auto mb-5 mt-1 max-w-md text-center text-sm text-bark">
              We&apos;re opening CoveyTracker to plantations a few at a time this season. Tell us about your property
              and we&apos;ll be in touch.
            </p>
            <WaitlistForm />
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-6 text-xs text-bark">
          <span>© {new Date().getFullYear()} Rumph Advisory</span>
          <Link href="/demo" className="hover:underline">
            Demo
          </Link>
          <Link href="/login" className="hover:underline">
            Beta sign-in
          </Link>
        </div>
      </footer>
    </div>
  );
}
