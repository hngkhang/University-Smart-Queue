import { Construction } from "lucide-react";
import { Link } from "react-router";

interface PlaceholderPageProps {
  title: string;
}

function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <main className="mx-auto max-w-7xl px-4 py-20 text-center sm:px-6 lg:px-8">
      <Construction className="mx-auto text-slate-300" size={44} />

      <h1 className="mt-5 text-2xl font-bold text-slate-900">
        {title}
      </h1>

      <p className="mt-2 text-sm text-slate-500">
        This page will be implemented in the next step.
      </p>

      <Link
        to="/"
        className="mt-6 inline-block rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white"
      >
        Back to Home
      </Link>
    </main>
  );
}

export default PlaceholderPage;