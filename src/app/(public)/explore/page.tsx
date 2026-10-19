import { redirect } from "next/navigation";

/**
 * Legacy entry point.
 *
 * `/explore` used to render one mixed directory. It now splits into
 * `/explore/centers` and `/explore/kindergartens`, so this route exists only to
 * keep every old inbound link, bookmark and QR code working: it forwards to the
 * centres directory, which is the closest match to what used to be here.
 *
 * `permanentRedirect` would be wrong while the split is still bedding in — a
 * 308 is cached by browsers and would be hard to unwind.
 */
export default function ExplorePage() {
  redirect("/explore/centers");
}
