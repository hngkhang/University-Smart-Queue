import { ArrowUpRight, MapPin } from "lucide-react";
import { Link } from "react-router";
import logo from "../assets/hcmute-logo.png";

export default function Footer() {
  return (
    <footer className="sq-footer">
      <div className="sq-container">
        <div className="sq-footer-main">
          <div>
            <Link to="/" className="sq-brand" aria-label="SmartQueue home">
              <img src={logo} alt="HCMUTE" width="44" height="44" />
              <div>
                <span>
                  Smart<span className="sq-brand-accent">Queue</span>
                  <span className="sq-brand-period">.</span>
                </span>
                <small>HCMUTE STUDENT SERVICES</small>
              </div>
            </Link>
            <p>
              A better way to navigate student services.
              <br />
              Built around your campus. Designed around you.
            </p>
          </div>
          <nav aria-label="Student services">
            <h2>YOUR CAMPUS TOOLKIT</h2>
            <Link to="/">
              Explore departments <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
            <Link to="/queue">
              My queue <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
            <Link to="/appointments/new">
              Book an appointment <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
            <a href="/#how-it-works">
              How it works <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </nav>
          <div className="sq-footer-campus">
            <h2>FIND US ON CAMPUS</h2>
            <p>
              HCMC University of
              <br />
              Technology and Engineering
            </p>
            <span>
              <MapPin size={17} aria-hidden="true" />
              01 Vo Van Ngan, Ho Chi Minh City
            </span>
          </div>
        </div>
        <div className="sq-footer-bottom">
          <span>© {new Date().getFullYear()} HCMUTE SmartQueue.</span>
          <span>A little less waiting. A little more living.</span>
        </div>
      </div>
    </footer>
  );
}
