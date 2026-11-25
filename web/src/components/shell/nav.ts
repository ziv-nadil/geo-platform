import {
  Bot,
  ClipboardList,
  FileSearch,
  FileText,
  Gauge,
  HeartPulse,
  LayoutDashboard,
  Link2,
  Megaphone,
  MessageSquareQuote,
  MessagesSquare,
  PenLine,
  Settings,
  Smile,
  Swords,
  Clapperboard,
  Video,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Monitor",
    items: [
      { href: "", label: "Overview", icon: LayoutDashboard },
      { href: "/prompts", label: "Prompts", icon: MessageSquareQuote },
      { href: "/competitors", label: "Competitors", icon: Swords },
      { href: "/citations", label: "Citations & sources", icon: Link2 },
      { href: "/responses", label: "Responses", icon: MessagesSquare },
      { href: "/sentiment", label: "Sentiment", icon: Smile },
    ],
  },
  {
    section: "Improve",
    items: [
      { href: "/site-health", label: "Site health", icon: HeartPulse },
      { href: "/crawlers", label: "AI crawlers", icon: Bot },
      { href: "/content", label: "Content", icon: PenLine },
      { href: "/content-gaps", label: "Content gaps", icon: FileSearch },
      { href: "/creators", label: "Creators", icon: Clapperboard },
      { href: "/youtube", label: "YouTube", icon: Video },
      { href: "/outreach", label: "Outreach", icon: Megaphone },
    ],
  },
  {
    section: "Account",
    items: [
      { href: "/reports", label: "Reports", icon: FileText },
      { href: "/onboarding", label: "Onboarding", icon: ClipboardList },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export const ADMIN_ICON = Gauge;
