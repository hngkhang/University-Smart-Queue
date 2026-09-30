import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  CircleHelp,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import DepartmentCard from "../components/DepartmentCard";
import StudentActivity from "../components/StudentActivity";
import { fetchDepartments } from "../services/departments";
import type { Department } from "../types";
import campusImage from "../assets/campus-landing.webp";

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .trim();
const steps = [
  {
    icon: Search,
    title: "Find your service",
    text: "Explore departments and choose the service you need.",
  },
  {
    icon: CalendarDays,
    title: "Choose your way",
    text: "Join an available queue or book an appointment for another day.",
  },
  {
    icon: Check,
    title: "Keep track of your visit",
    text: "Check your queue position or find your appointment details in one place.",
  },
];

export default function HomePage() {
  const [search, setSearch] = useState("");
  const [openOnly, setOpenOnly] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    fetchDepartments()
      .then((data) => {
        if (active) setDepartments(data);
      })
      .catch(() => {
        if (active)
          setError(
            "We couldn't connect to the department service. Please try again.",
          );
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [retry]);

  const keyword = normalize(search);
  const filteredDepartments = departments.filter((department) => {
    const matchesSearch = [
      department.name,
      department.vietnameseName,
      department.description,
      ...department.services,
    ].some((value) => normalize(value).includes(keyword));
    return matchesSearch && (!openOnly || department.status === "open");
  });
  // Suggest actual services rather than advertising services that may not exist.
  const suggestions = [
    ...new Set(
      departments
        .map((department) =>
          department.services.find(
            (service) => normalize(service) !== "general",
          ),
        )
        .filter((service): service is string => Boolean(service)),
    ),
  ].slice(0, 4);

  const focusSearch = () => {
    document
      .getElementById("find-service")
      ?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "start",
      });
    searchRef.current?.focus({ preventScroll: true });
  };

  return (
    <main className="sq-home">
      <section className="sq-hero" aria-labelledby="hero-heading">
        <div className="sq-container sq-hero-grid">
          <div className="sq-hero-copy">
            <p className="sq-eyebrow">
              <span className="sq-eyebrow-line" /> YOUR CAMPUS. YOUR TIME.
            </p>
            <h1 id="hero-heading">
              Student services,
              <br />
              on <span>your schedule.</span>
            </h1>
            <p className="sq-hero-description">
              A little less waiting. A little more campus life. Find the right
              department, join a queue, or plan your next visit with SmartQueue.
            </p>
            <div className="sq-hero-actions">
              <button
                className="sq-button sq-button-primary"
                onClick={focusSearch}
              >
                Explore services <ArrowUpRight size={18} aria-hidden="true" />
              </button>
              <Link
                className="sq-button sq-button-secondary"
                to="/appointments/new"
              >
                <CalendarDays size={18} aria-hidden="true" /> Book an
                appointment
              </Link>
            </div>
            <div className="sq-hero-notes">
              <span>
                <Check size={15} aria-hidden="true" /> Find your department
              </span>
              <span>
                <Check size={15} aria-hidden="true" /> Plan ahead
              </span>
              <span>
                <Check size={15} aria-hidden="true" /> Track your queue
              </span>
            </div>
          </div>
          <div className="sq-campus-visual">
            <div className="sq-campus-frame">
              <img
                src={campusImage}
                alt="The tree-lined entrance to the HCMUTE campus"
                width="1000"
                height="810"
                fetchPriority="high"
              />
              <div className="sq-campus-overlay" />
              <span className="sq-campus-tag">
                <span /> CONNECTED CAMPUS
              </span>
              <div className="sq-campus-caption">
                <span>MORE TIME FOR WHAT MATTERS</span>
                <p>
                  Your next chapter.
                  <br />
                  One less thing to wait for.
                </p>
              </div>
            </div>
            <div className="sq-campus-note">
              <span className="sq-note-icon">
                <CalendarDays size={23} aria-hidden="true" />
              </span>
              <div>
                <strong>A smoother campus day</strong>
                <span>Your services, all in one place.</span>
              </div>
              <ArrowUpRight size={19} aria-hidden="true" />
            </div>
            <span className="sq-visual-index" aria-hidden="true">
              01 / CAMPUS LIFE, SIMPLIFIED
            </span>
          </div>
        </div>
      </section>

      <div className="sq-container">
        <section
          id="find-service"
          className="sq-search-panel"
          aria-labelledby="search-heading"
        >
          <div className="sq-search-heading">
            <div>
              <span className="sq-section-kicker">LET'S GET YOU STARTED</span>
              <h2 id="search-heading">What can we help you with?</h2>
            </div>
            <ArrowDown size={23} aria-hidden="true" />
          </div>
          <form
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              document.getElementById("services-heading")?.focus();
            }}
          >
            <label className="sr-only" htmlFor="service-search">
              Search departments or services
            </label>
            <div className="sq-search-field">
              <Search size={22} aria-hidden="true" />
              <input
                ref={searchRef}
                id="service-search"
                type="search"
                autoComplete="off"
                placeholder="Try a service, like transcripts or tuition..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-controls="department-results"
              />
              {search && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => {
                    setSearch("");
                    searchRef.current?.focus();
                  }}
                >
                  <X size={18} aria-hidden="true" />
                </button>
              )}
              <button type="submit" className="sq-search-submit">
                Search <ArrowRight size={17} aria-hidden="true" />
              </button>
            </div>
          </form>
          {suggestions.length > 0 && (
            <div className="sq-suggestions">
              <span>Quick picks</span>
              {suggestions.map((service) => (
                <button
                  key={service}
                  onClick={() => setSearch(service)}
                  aria-pressed={search === service}
                >
                  {service}
                  <ArrowUpRight size={12} aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
        </section>

        <StudentActivity />

        <section
          id="services-section"
          className="sq-services"
          aria-labelledby="services-heading"
        >
          <div className="sq-section-header">
            <div>
              <p className="sq-section-kicker">THE RIGHT SUPPORT, RIGHT HERE</p>
              <h2 id="services-heading" tabIndex={-1}>
                Meet your departments<span className="sq-heading-dot">.</span>
              </h2>
              <p>
                Find the people and services that keep your campus life moving.
              </p>
            </div>
            <a href="#how-it-works" className="sq-text-link">
              How it works <ArrowDown size={15} aria-hidden="true" />
            </a>
          </div>
          <div className="sq-filter-row">
            <div className="sq-filter-buttons" aria-label="Filter departments">
              <button
                aria-pressed={!openOnly}
                className={!openOnly ? "is-active" : ""}
                onClick={() => setOpenOnly(false)}
              >
                All departments
              </button>
              <button
                aria-pressed={openOnly}
                className={openOnly ? "is-active" : ""}
                onClick={() => setOpenOnly(true)}
              >
                <span className="sq-status-dot" />
                Accepting queues
              </button>
            </div>
            <p role="status" aria-live="polite">
              {isLoading
                ? "Loading departments..."
                : error
                  ? "Departments unavailable"
                  : `${filteredDepartments.length} ${filteredDepartments.length === 1 ? "department" : "departments"}${keyword ? ` matching “${search.trim()}”` : " to explore"}`}
            </p>
          </div>
          <div id="department-results" aria-busy={isLoading}>
            {isLoading ? (
              <div
                className="sq-department-grid"
                aria-label="Loading departments"
              >
                {[0, 1, 2].map((item) => (
                  <div key={item} className="sq-skeleton" aria-hidden="true">
                    <div />
                    <div />
                    <div />
                    <div />
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="sq-empty" role="alert">
                <CircleHelp size={30} aria-hidden="true" />
                <h3>We couldn't load the departments</h3>
                <p>{error}</p>
                <button
                  className="sq-button sq-button-primary"
                  onClick={() => {
                    setError("");
                    setIsLoading(true);
                    setRetry((value) => value + 1);
                  }}
                >
                  Try again <ArrowRight size={16} aria-hidden="true" />
                </button>
              </div>
            ) : filteredDepartments.length > 0 ? (
              <div className="sq-department-grid">
                {filteredDepartments.map((department) => (
                  <DepartmentCard key={department.id} department={department} />
                ))}
              </div>
            ) : (
              <div className="sq-empty">
                <SlidersHorizontal size={30} aria-hidden="true" />
                <h3>
                  {departments.length === 0
                    ? "Departments are on their way"
                    : "No matching departments"}
                </h3>
                <p>
                  {departments.length === 0
                    ? "Please check back soon for available student services."
                    : "Try another service name or view all departments."}
                </p>
                {(search || openOnly) && (
                  <button
                    className="sq-button sq-button-secondary"
                    onClick={() => {
                      setSearch("");
                      setOpenOnly(false);
                    }}
                  >
                    Clear filters <X size={16} aria-hidden="true" />
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="sq-booking-banner">
            <div className="sq-booking-icon">
              <CalendarDays size={25} aria-hidden="true" />
            </div>
            <div>
              <h3>A busy week ahead?</h3>
              <p>
                Find an available appointment and make room for what matters.
              </p>
            </div>
            <Link to="/appointments/new" className="sq-text-link">
              Plan your visit <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </div>

      <section
        id="how-it-works"
        className="sq-guide"
        aria-labelledby="guide-heading"
      >
        <div className="sq-container">
          <div className="sq-guide-header">
            <div>
              <p className="sq-section-kicker">SIMPLE FROM THE START</p>
              <h2 id="guide-heading">Your next visit, in three steps.</h2>
            </div>
            <p>
              Less figuring things out.
              <br />
              More getting things done.
            </p>
          </div>
          <ol className="sq-guide-grid">
            {steps.map((step, index) => (
              <li key={step.title}>
                <div className="sq-step-top">
                  <step.icon size={25} aria-hidden="true" />
                  <span>0{index + 1}</span>
                </div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
          <div className="sq-guide-bottom">
            <span>Ready when you are.</span>
            <button onClick={focusSearch}>
              Find your service <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
