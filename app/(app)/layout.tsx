import Nav from "@/components/Nav";
import PropertyProvider from "@/components/PropertyProvider";
import QueueSync from "@/components/QueueSync";
import ServiceWorker from "@/components/ServiceWorker";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <PropertyProvider>
      <Nav />
      <QueueSync />
      <ServiceWorker />
      <main className="mx-auto max-w-6xl px-4 pb-28 pt-4 md:pb-10 print:max-w-none print:p-0">{children}</main>
    </PropertyProvider>
  );
}
