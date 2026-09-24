import { Link } from "react-router";
import logo from "../assets/hcmute-logo.png";

function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white pt-16 pb-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4 lg:grid-cols-5">
          <div className="md:col-span-2 lg:col-span-2">
            <Link to="/" className="flex items-center gap-3">
              <img
                src={logo}
                alt="HCMUTE Logo"
                className="h-12 w-12 shrink-0 object-contain"
              />
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-[#0B1F3A]">
                  Ho Chi Minh City University of
                </p>
                <p className="text-sm font-extrabold text-[#0B1F3A]">
                  Technology and Education
                </p>
              </div>
            </Link>
            <p className="mt-4 text-sm text-slate-500 leading-relaxed max-w-xs">
              SmartQueue - The central hub for student services, queue management, and appointment scheduling at HCMUTE.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">Services</h3>
            <ul className="mt-4 space-y-3">
              <li>
                <Link to="/" className="text-sm text-slate-500 hover:text-blue-600 transition-colors">
                  Departments
                </Link>
              </li>
              <li>
                <Link to="/queue" className="text-sm text-slate-500 hover:text-blue-600 transition-colors">
                  Join Queue
                </Link>
              </li>
              <li>
                <Link to="/appointments" className="text-sm text-slate-500 hover:text-blue-600 transition-colors">
                  Book Appointment
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">Support</h3>
            <ul className="mt-4 space-y-3">
              <li>
                <a href="#" className="text-sm text-slate-500 hover:text-blue-600 transition-colors">
                  Help Center
                </a>
              </li>
              <li>
                <a href="#" className="text-sm text-slate-500 hover:text-blue-600 transition-colors">
                  User Guide
                </a>
              </li>
              <li>
                <a href="#" className="text-sm text-slate-500 hover:text-blue-600 transition-colors">
                  Contact Us
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">Legal</h3>
            <ul className="mt-4 space-y-3">
              <li>
                <a href="#" className="text-sm text-slate-500 hover:text-blue-600 transition-colors">
                  Privacy Policy
                </a>
              </li>
              <li>
                <a href="#" className="text-sm text-slate-500 hover:text-blue-600 transition-colors">
                  Terms of Service
                </a>
              </li>
            </ul>
          </div>
        </div>
        
        <div className="mt-16 border-t border-slate-100 pt-8 flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-sm text-slate-500">
            &copy; {new Date().getFullYear()} HCMUTE SmartQueue. All rights reserved.
          </p>
          <div className="flex gap-4">
            <span className="text-sm text-slate-400">01 Vo Van Ngan, Thu Duc City, HCMC</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
