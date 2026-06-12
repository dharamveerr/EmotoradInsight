"use client";

import { useState } from "react";

// Shared avatar: renders the user's picture (Google profile pics need
// referrerPolicy="no-referrer" or googleusercontent returns 403) and
// falls back to initials when there is no picture or it fails to load.
export default function Avatar({
  name,
  picture,
  className = "w-9 h-9",
  textClass = "text-sm",
}: {
  name: string;
  picture: string | null;
  className?: string;
  textClass?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (picture && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={picture}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`${className} rounded-full object-cover border border-white/10`}
      />
    );
  }

  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      className={`${className} rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white ${textClass} font-bold border border-white/10`}
    >
      {initials}
    </div>
  );
}
