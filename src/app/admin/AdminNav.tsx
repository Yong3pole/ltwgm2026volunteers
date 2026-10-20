"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AdminNav() {
  const pathname = usePathname();
  return <nav className="admin-nav" aria-label="Admin sections">
    <p className="eyebrow eyebrow--dark">Coordinator tools</p>
    <Link className={pathname === "/admin" ? "admin-nav__link admin-nav__link--active" : "admin-nav__link"} href="/admin">Manage bookings <span>→</span></Link>
    <Link className={pathname.startsWith("/admin/schedule") ? "admin-nav__link admin-nav__link--active" : "admin-nav__link"} href="/admin/schedule">Manage schedule <span>→</span></Link>
  </nav>;
}
