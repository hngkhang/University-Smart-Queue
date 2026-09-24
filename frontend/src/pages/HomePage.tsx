import { Search, Grid, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import DepartmentCard from "../components/DepartmentCard";
import { fetchDepartments } from "../services/departments";
import type { Department } from "../types";

function HomePage() {
  const [search, setSearch] = useState("");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    const loadDepartments = async () => {
      try {
        setIsLoading(true);
        setError("");

        const data = await fetchDepartments();

        if (isMounted) {
          setDepartments(data);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load departments right now.",
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadDepartments();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredDepartments = departments.filter((department) => {
    const keyword = search.toLowerCase();

    return (
      department.name.toLowerCase().includes(keyword) ||
      department.vietnameseName.toLowerCase().includes(keyword) ||
      department.services.some((service) =>
        service.toLowerCase().includes(keyword),
      )
    );
  });

  const scrollToServices = () => {
    document.getElementById("services-section")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <main className="min-h-screen bg-slate-100 pb-20">
      {/* Top Dashboard Header */}
      <section className="bg-blue-50 border-b border-blue-200">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            
            {/* Left side: Intro & Search */}
            <div className="lg:col-span-7">
              <h1 className="text-3xl font-bold tracking-tight text-indigo-950 sm:text-4xl">
                Student Service System
              </h1>
              <p className="mt-4 text-lg text-slate-700">
                Quickly look up information
              </p>

              <div className="mt-8 max-w-xl relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                  <Search className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search departments or services..."
                  className="w-full rounded-md border border-blue-300 bg-white py-3 pl-11 pr-4 text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 text-base shadow-sm"
                />
              </div>
            </div>

            {/* Right side: 2 Quick Buttons */}
            <div className="lg:col-span-5 flex flex-col gap-3 lg:items-end justify-center">
              <div className="w-full max-w-sm flex flex-col gap-3">
                <button 
                  onClick={scrollToServices}
                  className="flex items-center gap-3 rounded-md border border-blue-200 bg-white p-3 text-left transition hover:border-blue-400 hover:shadow-md"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-blue-100 text-blue-700">
                    <Grid size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-indigo-950">View Services</h3>
                    <p className="text-xs text-slate-500">Browse all departments</p>
                  </div>
                </button>
                
                <button 
                  className="flex items-center gap-3 rounded-md border border-blue-200 bg-white p-3 text-left transition hover:border-blue-400 hover:shadow-md"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-indigo-100 text-indigo-700">
                    <Sparkles size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-indigo-950">Chat with AI</h3>
                    <p className="text-xs text-slate-500">Ask questions instantly</p>
                  </div>
                </button>
              </div>
            </div>
            
          </div>
        </div>
      </section>

      {/* Departments Section */}
      <section id="services-section" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="mb-10 flex flex-col items-start justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">Departments</h2>
            <p className="mt-2 text-sm text-slate-500 sm:text-base">
              Showing {filteredDepartments.length} available departments
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center rounded-md bg-white py-32 border border-slate-200">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600"></div>
            <h3 className="mt-4 font-semibold text-slate-800">Loading departments...</h3>
          </div>
        ) : error ? (
          <div className="rounded-md bg-red-50 py-16 text-center border border-red-100">
            <h3 className="text-lg font-bold text-red-800">Unable to load data</h3>
            <p className="mt-2 text-sm text-red-600">{error}</p>
          </div>
        ) : filteredDepartments.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredDepartments.map((department) => (
              <DepartmentCard
                key={department.id}
                department={department}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-md bg-white py-32 text-center border border-slate-200">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-md bg-slate-50">
              <Search className="h-8 w-8 text-slate-300" />
            </div>
            <h3 className="mt-4 text-lg font-bold text-slate-800">No departments found</h3>
            <p className="mt-2 text-sm text-slate-500">
              Please try searching with a different keyword.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}

export default HomePage;
