"use client";

import { Menu } from "lucide-react";
import { useSidebar } from "./providers/SidebarProvider";

export function SidebarToggle() {
  const { toggle } = useSidebar();

  return (
    <button
      onClick={toggle}
      className="p-2 -ml-2 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-100 dark:hover:bg-gray-800 transition-colors lg:hidden"
      aria-label="Toggle navigation"
    >
      <Menu size={20} />
    </button>
  );
}
