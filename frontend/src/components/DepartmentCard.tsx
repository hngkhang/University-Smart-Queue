import {
  ArrowUpRight,
  BookOpen,
  Building2,
  GraduationCap,
  Monitor,
  Users,
  Wallet,
} from "lucide-react";
import { Link } from "react-router";
import type { Department } from "../types";

function departmentStyle(name: string) {
  if (/financ|tuition/i.test(name))
    return { icon: Wallet, tone: "mint", label: "FINANCE & FEES" };
  if (/library/i.test(name))
    return { icon: BookOpen, tone: "amber", label: "LEARNING & RESOURCES" };
  if (/academic|registrar|training/i.test(name))
    return { icon: GraduationCap, tone: "blue", label: "ACADEMIC SUPPORT" };
  if (/\bit\b|computer|technology/i.test(name))
    return { icon: Monitor, tone: "blue", label: "TECHNOLOGY SUPPORT" };
  if (/student/i.test(name))
    return { icon: Users, tone: "mint", label: "STUDENT SUPPORT" };
  return { icon: Building2, tone: "blue", label: "CAMPUS SERVICES" };
}

export default function DepartmentCard({
  department,
}: {
  department: Department;
}) {
  const { icon: Icon, tone, label } = departmentStyle(department.name);
  const services = department.services
    .filter((service) => service.toLowerCase() !== "general")
    .slice(0, 3);
  const statusLabel = {
    open: "Accepting queues",
    paused: "Queue paused",
    closed: "Queue closed",
  }[department.status];

  return (
    <article className={`sq-department sq-tone-${tone}`}>
      <div className="sq-department-top">
        <span className="sq-department-icon">
          <Icon size={26} strokeWidth={1.7} aria-hidden="true" />
        </span>
        <span className={`sq-status sq-status-${department.status}`}>
          <span />
          {statusLabel}
        </span>
      </div>
      <p className="sq-department-category">{label}</p>
      <h3>{department.name}</h3>
      <p className="sq-department-description">
        {department.description ||
          "Explore the services and support available from this department."}
      </p>
      <ul className="sq-service-tags" aria-label="Available services">
        {services.map((service) => (
          <li key={service}>{service}</li>
        ))}
      </ul>
      <div className="sq-department-bottom">
        <span>
          <Users size={15} aria-hidden="true" />
          {department.waitingCount} waiting
        </span>
        <Link
          to={`/departments/${department.id}`}
          aria-label={`Explore services at ${department.name}`}
        >
          Explore services <ArrowUpRight size={18} aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
