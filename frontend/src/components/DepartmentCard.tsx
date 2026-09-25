import {
  Clock3,
  Users,
  UserRoundCheck,
  
} from "lucide-react";
import { Link } from "react-router";
import type { Department } from "../types";
import coverImage from "../assets/department-cover.jpg";

interface DepartmentCardProps {
  department: Department;
}

function DepartmentCard({ department }: DepartmentCardProps) {
  const isOpen = department.status === "open";

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition duration-200 hover:shadow-md">
      {/* Top Image */}
      <div className="h-44 w-full overflow-hidden bg-slate-100">
        <img
          src={coverImage}
          alt={department.name}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      </div>

      <div className="flex flex-1 flex-col p-5">
        {/* Title & Status */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-900 leading-tight">
            {department.name}
          </h2>
          <div
            className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${
              isOpen
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-slate-50 text-slate-500 border border-slate-200"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isOpen ? "bg-emerald-500" : "bg-slate-400"
              }`}
            />
            {isOpen ? "Open" : department.status === "paused" ? "Paused" : "Closed"}
          </div>
        </div>

        {/* Spacer to push stats to bottom if title is short */}
        <div className="flex-1"></div>

        {/* Stats Grid */}
        <div className="mb-5 grid grid-cols-3 gap-1 rounded-lg bg-slate-50 p-3 border border-slate-100">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="flex items-center gap-1 text-slate-400 mb-1">
              <Users size={14} />
              <span className="text-[10px] font-bold uppercase tracking-wider">Wait</span>
            </div>
            <p className="text-sm font-bold text-slate-800">
              {department.waitingCount}
            </p>
          </div>

          <div className="flex flex-col items-center justify-center text-center border-x border-slate-200 px-1">
            <div className="flex items-center gap-1 text-slate-400 mb-1">
              <Clock3 size={14} />
              <span className="text-[10px] font-bold uppercase tracking-wider">ETA</span>
            </div>
            <p className="text-sm font-bold text-slate-800">
              {isOpen && department.estimatedWait != null ? `${department.estimatedWait}m` : "--"}
            </p>
          </div>

          <div className="flex flex-col items-center justify-center text-center">
            <div className="flex items-center gap-1 text-slate-400 mb-1">
              <UserRoundCheck size={14} />
              <span className="text-[10px] font-bold uppercase tracking-wider">Desk</span>
            </div>
            <p className="text-sm font-bold text-slate-800">
              {department.activeCounters ?? "--"}
            </p>
          </div>
        </div>

        {/* Action Button */}
        <Link
          to={`/departments/${department.id}`}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#3F6392] px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-[#2E4B72] shadow-sm hover:shadow active:scale-[0.98]"
        >
          View Department
          
        </Link>
      </div>
    </article>
  );
}

export default DepartmentCard;
