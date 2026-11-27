import Nav from "@/components/Nav";
import PropertyProvider from "@/components/PropertyProvider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <PropertyProvider>
      <Nav />
      <main className="mx-auto max-w-6xl px-4 pb-28 pt-4 md:pb-10">{children}</main>
    </PropertyProvider>
  );
}
