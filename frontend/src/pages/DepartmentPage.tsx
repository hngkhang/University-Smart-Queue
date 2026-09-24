import {
  ArrowLeft,
  
  CalendarDays,
  Clock3,
  MapPin,
  Users,
  UserRoundCheck,
} from "lucide-react";
import { Link, useParams } from "react-router";
import { useEffect, useState } from "react";
import { fetchDepartment } from "../services/departments";
import type { Department } from "../types";

function DepartmentPage() {
  const { departmentId } = useParams();
  const [department, setDepartment] = useState<Department | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    const loadDepartment = async () => {
      if (!departmentId) {
        setError("Department not found.");
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError("");

        const data = await fetchDepartment(departmentId);

        if (isMounted) {
          setDepartment(data);
        }
      } catch (loadError) {
        if (isMounted) {
          setDepartment(null);
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load department right now.",
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadDepartment();

    return () => {
      isMounted = false;
    };
  }, [departmentId]);

  if (isLoading) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold text-slate-900">
          Loading department...
        </h1>

        <p className="mt-2 text-sm text-slate-500">
          Fetching department details from the server.
        </p>
      </main>
    );
  }

  if (!department) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold text-slate-900">
          {error || "Department not found"}
        </h1>

        <Link
          to="/"
          className="mt-4 inline-block text-sm font-semibold text-blue-700"
        >
          Back to Home
        </Link>
      </main>
    );
  }

  const isOpen = department.status === "open";

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-blue-700"
      >
        <ArrowLeft size={17} />
        Back to Homepage
      </Link>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div>
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
              <div className="flex gap-4">
               

                <div>
                  <h1 className="text-2xl font-bold text-slate-900">
                    {department.name}
                  </h1>

             

                  <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
                    {department.description}
                  </p>
                </div>
              </div>

              <span
                className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${
                  isOpen
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {isOpen ? "Open" : "Closed"}
              </span>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-4">
                <Users size={19} className="text-blue-700" />
                <p className="mt-3 text-2xl font-bold text-slate-900">
                  {department.waitingCount}
                </p>
                <p className="text-sm text-slate-500">Students waiting</p>
              </div>

              <div className="rounded-xl bg-slate-50 p-4">
                <Clock3 size={19} className="text-blue-700" />
                <p className="mt-3 text-2xl font-bold text-slate-900">
                  {isOpen ? `~${department.estimatedWait}` : "--"}
                </p>
                <p className="text-sm text-slate-500">
                  Estimated minutes
                </p>
              </div>

              <div className="rounded-xl bg-slate-50 p-4">
                <UserRoundCheck size={19} className="text-blue-700" />
                <p className="mt-3 text-2xl font-bold text-slate-900">
                  {department.activeCounters}
                </p>
                <p className="text-sm text-slate-500">Active counters</p>
              </div>
            </div>

            <div className="mt-8">
              <h2 className="text-lg font-bold text-slate-900">
                Available Services
              </h2>

              <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
                {department.services.map((service) => (
                  <div
                    key={service}
                    className="px-4 py-4 text-sm font-medium text-slate-700"
                  >
                    {service}
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-bold text-slate-900">Visit Information</h2>

            <div className="mt-5 space-y-4">
              <div className="flex gap-3">
                <MapPin size={18} className="mt-0.5 text-slate-400" />
                <div>
                  <p className="text-xs text-slate-400">Location</p>
                  <p className="text-sm font-medium text-slate-700">
                    {department.location}
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <Clock3 size={18} className="mt-0.5 text-slate-400" />
                <div>
                  <p className="text-xs text-slate-400">Working Hours</p>
                  <p className="text-sm font-medium text-slate-700">
                    {department.workingHours}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-bold text-slate-900">
              How would you like to visit?
            </h2>

            <div className="mt-4 space-y-3">
              <button
                type="button"
                disabled={!isOpen}
                className="w-full rounded-xl bg-[#3F6392] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#2E4B72] disabled:cursor-not-allowed disabled:bg-slate-300 shadow-sm hover:shadow active:scale-[0.98]"
              >
                Join Online Queue
              </button>

              <Link
                to={`/appointments/new?department=${encodeURIComponent(department.id)}`}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <CalendarDays size={17} />
                Book Appointment
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}

export default DepartmentPage;
